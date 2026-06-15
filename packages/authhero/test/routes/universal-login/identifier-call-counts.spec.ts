import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { countingAdapter } from "../../helpers/counting-adapter";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";

/**
 * Regression guard: count every adapter method invocation on a real
 * GET /u2/login/identifier render through the full middleware stack.
 *
 * The identifier page is the very first screen of the login flow, so it is
 * served on essentially every interactive login. The only data that is
 * genuinely per-request (and therefore un-cacheable) is the login session,
 * keyed by `state`. Everything else — the client, tenant, theme, branding,
 * connections, plus the universal-login template and custom text — is
 * per-(tenant, client) or per-tenant config that the warm ClientBundle (L0)
 * and the L2 cache must serve without touching the raw adapter.
 *
 * Floor on the warm path: 1 × loginSessions.get, zero of everything else.
 */
describe("u2 identifier — adapter call counts", () => {
  it("warm-cache GET /u2/login/identifier reads only the login session", async () => {
    const counting = {
      value: undefined as ReturnType<typeof countingAdapter> | undefined,
    };
    const { oauthApp, u2App, env } = await getTestServer({
      persistentCache: true,
      wrapDataAdapter: (data) => {
        const c = countingAdapter(data);
        counting.value = c;
        return c.wrapped;
      },
    });
    // Opt into the client-facing Server-Timing header — it is off by default
    // so per-operation timings are never exposed to anonymous callers in
    // production. This test inspects the header to assert the timing trace.
    env.SERVER_TIMING = "client";

    const oauthClient = testClient(oauthApp, env);
    const u2Client = testClient(u2App, env);

    // Mirror the production deployment: the universal-login host is a custom
    // domain. Tenant resolution for the u2 screens therefore goes through
    // customDomains.getByDomain (an L2-cached read) rather than the
    // single-tenant auto-detect (tenants.list) fallback. Seeded via the raw
    // env.data adapter so this write isn't counted.
    const loginDomain = "login.example.com";
    await env.data.customDomains.create("tenantId", {
      domain: loginDomain,
      custom_domain_id: "custom-domain-id",
      type: "auth0_managed_certs",
    });

    // 1) /authorize — warms the (tenant, client) bundle and creates the login
    //    session, exactly as the production flow does, then 302s to the
    //    universal-login identifier screen with the session id as `state`.
    const authorize = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.CODE,
          redirect_uri: "https://example.com/callback",
          state: "client-state",
          scope: "openid",
        },
      },
      { headers: { origin: "https://example.com" } },
    );
    expect(authorize.status).toBe(302);
    const state = new URL(
      authorize.headers.get("location")!,
      "http://localhost:3000",
    ).searchParams.get("state");
    expect(state).toBeTruthy();

    // 2) First identifier render — warms the L2 cache for the entities the u2
    //    route reads but /authorize does not (universalLoginTemplates, the
    //    per-screen/per-language customText lookups). The bundle is already
    //    warm from /authorize.
    const warm = await u2Client.login.identifier.$get(
      { query: { state: state! } },
      { headers: { host: loginDomain } },
    );
    expect(warm.status).toBe(200);

    counting.value!.reset();

    // 3) Second identifier render with the same state — everything except the
    //    login session must be served from the warm bundle / L2 cache.
    const response = await u2Client.login.identifier.$get(
      { query: { state: state! } },
      { headers: { host: loginDomain } },
    );
    expect(response.status).toBe(200);

    const counts = counting.value!.counts;

    // The single irreducible per-request read.
    expect(counts["loginSessions.get"] ?? 0).toBe(1);
    // A bare GET render must not mutate the login session.
    expect(counts["loginSessions.update"] ?? 0).toBe(0);

    // Per-(tenant, client) config — served by the warm bundle (L0).
    expect(counts["tenants.get"] ?? 0).toBe(0);
    expect(counts["clients.get"] ?? 0).toBe(0);
    expect(counts["clients.getByClientId"] ?? 0).toBe(0);
    expect(counts["connections.list"] ?? 0).toBe(0);
    expect(counts["clientConnections.listByClient"] ?? 0).toBe(0);
    expect(counts["branding.get"] ?? 0).toBe(0);
    expect(counts["themes.get"] ?? 0).toBe(0);

    // The long-tail UI config — served by the L2 cache (incl. negative hits).
    expect(counts["universalLoginTemplates.get"] ?? 0).toBe(0);
    expect(counts["customText.get"] ?? 0).toBe(0);

    // Tenant/domain middleware fallbacks must not fire on a known client.
    expect(counts["tenants.list"] ?? 0).toBe(0);
    expect(counts["customDomains.getByDomain"] ?? 0).toBe(0);

    // Server-Timing is emitted from the innermost (raw) layer, so it carries
    // one entry per genuine backend round-trip — not one per surface read.
    // On the warm path the only backend call is loginSessions.get, so the
    // header must contain exactly that and nothing cache/bundle-served.
    const serverTiming = response.headers.get("Server-Timing") ?? "";
    const timedEntities = serverTiming
      .split(",")
      .map((entry) => entry.trim().split(";")[0])
      .filter(Boolean);
    expect(timedEntities).toContain("loginSessions-get");
    expect(timedEntities).not.toContain("clients-get");
    expect(timedEntities).not.toContain("tenants-get");
    expect(timedEntities).not.toContain("customText-get");
    expect(timedEntities).not.toContain("universalLoginTemplates-get");
    expect(timedEntities).not.toContain("customDomains-getByDomain");

    // Cache-backend latency is still observable, labelled by key prefix — the
    // warm bundle is served by a single client-bundle cache read. These entries
    // capture the Cache API round-trip the data-adapter timing no longer sees.
    expect(timedEntities).toContain("cache-get:client-bundle");
  });

  it("cold-cache GET /u2/login/identifier reads each config entity at most once", async () => {
    const counting = {
      value: undefined as ReturnType<typeof countingAdapter> | undefined,
    };
    const { u2App, env } = await getTestServer({
      persistentCache: true,
      wrapDataAdapter: (data) => {
        const c = countingAdapter(data);
        counting.value = c;
        return c.wrapped;
      },
    });
    const u2Client = testClient(u2App, env);

    const loginDomain = "login.example.com";
    await env.data.customDomains.create("tenantId", {
      domain: loginDomain,
      custom_domain_id: "custom-domain-id",
      type: "auth0_managed_certs",
    });

    // Seed the login session directly (not via /authorize) so the bundle is
    // never warmed — the u2 render below has to assemble it cold. Written via
    // the raw env.data adapter so the setup isn't counted.
    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        scope: "openid",
      },
      authorization_url: `https://${loginDomain}/authorize?client_id=clientId`,
    });

    counting.value!.reset();

    const response = await u2Client.login.identifier.$get(
      { query: { state: loginSession.id } },
      { headers: { host: loginDomain } },
    );
    expect(response.status).toBe(200);

    const counts = counting.value!.counts;

    // Cold bundle assembly + request-scoped dedup must collapse every repeated
    // config read to at most one raw call. The production server-timing trace
    // showed clients-get logged three times on a cold render — but that is the
    // outermost timing wrapper counting every call into the adapter stack
    // (incl. bundle/dedup hits), not three DB round-trips. This pins the raw
    // read count at one each.
    expect(counts["clients.get"] ?? 0).toBeLessThanOrEqual(1);
    expect(counts["clients.getByClientId"] ?? 0).toBeLessThanOrEqual(1);
    expect(counts["tenants.get"] ?? 0).toBeLessThanOrEqual(1);
    expect(counts["connections.list"] ?? 0).toBeLessThanOrEqual(1);
    expect(counts["clientConnections.listByClient"] ?? 0).toBeLessThanOrEqual(1);
    expect(counts["branding.get"] ?? 0).toBeLessThanOrEqual(1);
    expect(counts["themes.get"] ?? 0).toBeLessThanOrEqual(1);
    expect(counts["universalLoginTemplates.get"] ?? 0).toBeLessThanOrEqual(1);
  });
});
