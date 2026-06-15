import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { countingAdapter } from "../../helpers/counting-adapter";
import {
  AuthorizationResponseType,
  CodeChallengeMethod,
  LoginSessionState,
} from "@authhero/adapter-interfaces";

/**
 * Regression guard: count every adapter method invocation on a real
 * /authorize request through the full middleware stack. If someone adds
 * a stray data read in a hot path — or breaks the prefetch / bundle wiring —
 * one of these expectations will fail.
 *
 * Two passes per scenario:
 * 1. Cold cache — the bundle has to be assembled. Expect each bundle-covered
 *    entity to be read once.
 * 2. Warm cache — repeat the same request. Expect zero bundle-covered reads
 *    (entire bundle served from the cache key).
 */
describe("authorize — adapter call counts", () => {
  it("cold-cache /authorize for a known client makes the minimal data calls", async () => {
    const counting = {
      value: undefined as ReturnType<typeof countingAdapter> | undefined,
    };
    const { oauthApp, env } = await getTestServer({
      persistentCache: true,
      wrapDataAdapter: (data) => {
        const c = countingAdapter(data);
        counting.value = c;
        return c.wrapped;
      },
    });
    const client = testClient(oauthApp, env);
    counting.value!.reset(); // clear any post-seed reads

    const response = await client.authorize.$get(
      {
        query: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.CODE,
          redirect_uri: "https://example.com/callback",
          state: "state",
          scope: "openid",
          code_challenge: "abc123abc123abc123abc123abc123abc123abc123",
          code_challenge_method: CodeChallengeMethod.S256,
        },
      },
      {
        headers: { origin: "https://example.com" },
      },
    );

    // Assert the warm path actually succeeded before checking call counts —
    // otherwise a 4xx early-exit would trivially satisfy the "minimal calls"
    // assertions below without exercising the cached bundle. Success here is a
    // 302 redirect to the universal-login page.
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBeTruthy();

    const counts = counting.value!.counts;

    // Bundle-covered entities — each should hit upstream at most once
    // during the bundle's parallel fetch.
    expect(counts["tenants.get"] ?? 0).toBeLessThanOrEqual(1);
    expect(counts["clients.get"] ?? 0).toBeLessThanOrEqual(1);
    expect(counts["clients.getByClientId"] ?? 0).toBeLessThanOrEqual(1);
    expect(counts["connections.list"] ?? 0).toBeLessThanOrEqual(1);
    expect(counts["clientConnections.listByClient"] ?? 0).toBeLessThanOrEqual(
      1,
    );
    expect(counts["branding.get"] ?? 0).toBeLessThanOrEqual(1);
    expect(counts["resourceServers.list"] ?? 0).toBeLessThanOrEqual(1);
    expect(counts["promptSettings.get"] ?? 0).toBeLessThanOrEqual(1);
    expect(counts["hooks.list"] ?? 0).toBeLessThanOrEqual(1);
    expect(counts["themes.get"] ?? 0).toBeLessThanOrEqual(1);
  });

  it("warm-cache /authorize hits zero bundle-covered reads", async () => {
    const counting = {
      value: undefined as ReturnType<typeof countingAdapter> | undefined,
    };
    const { oauthApp, env } = await getTestServer({
      persistentCache: true,
      wrapDataAdapter: (data) => {
        const c = countingAdapter(data);
        counting.value = c;
        return c.wrapped;
      },
    });
    const client = testClient(oauthApp, env);

    // First /authorize — warms the bundle.
    await client.authorize.$get(
      {
        query: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.CODE,
          redirect_uri: "https://example.com/callback",
          state: "state1",
          scope: "openid",
          code_challenge: "abc123abc123abc123abc123abc123abc123abc123",
          code_challenge_method: CodeChallengeMethod.S256,
        },
      },
      { headers: { origin: "https://example.com" } },
    );

    counting.value!.reset();

    // Second /authorize with a fresh state — the bundle for
    // (tenantId, clientId) is now in cache. Should serve zero
    // bundle-covered reads from the raw adapter.
    const response = await client.authorize.$get(
      {
        query: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.CODE,
          redirect_uri: "https://example.com/callback",
          state: "state2",
          scope: "openid",
          code_challenge: "abc123abc123abc123abc123abc123abc123abc123",
          code_challenge_method: CodeChallengeMethod.S256,
        },
      },
      { headers: { origin: "https://example.com" } },
    );

    // The warm request must have succeeded (302 to universal-login) for the
    // zero-read assertions below to be meaningful.
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBeTruthy();

    const counts = counting.value!.counts;

    // None of the bundle-covered entities should have been read from raw
    // on the warm path.
    expect(counts["tenants.get"] ?? 0).toBe(0);
    expect(counts["clients.get"] ?? 0).toBe(0);
    expect(counts["clients.getByClientId"] ?? 0).toBe(0);
    expect(counts["connections.list"] ?? 0).toBe(0);
    expect(counts["clientConnections.listByClient"] ?? 0).toBe(0);
    expect(counts["branding.get"] ?? 0).toBe(0);
    expect(counts["resourceServers.list"] ?? 0).toBe(0);
    expect(counts["promptSettings.get"] ?? 0).toBe(0);
    expect(counts["hooks.list"] ?? 0).toBe(0);
    expect(counts["themes.get"] ?? 0).toBe(0);
  });

  it("warm-cache /authorize?connection=… uses the minimum: 1 loginSessions.get + 1 codes.create", async () => {
    const counting = {
      value: undefined as ReturnType<typeof countingAdapter> | undefined,
    };
    const { oauthApp, env } = await getTestServer({
      persistentCache: true,
      wrapDataAdapter: (data) => {
        const c = countingAdapter(data);
        counting.value = c;
        return c.wrapped;
      },
    });
    const client = testClient(oauthApp, env);

    // First /authorize without a connection — warms the bundle, creates a
    // login session, and 302s to the universal-login identifier screen with
    // the session id as `state`. This mirrors the widget flow in production.
    const initial = await client.authorize.$get(
      {
        query: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.CODE,
          redirect_uri: "https://example.com/callback",
          state: "client-state",
          scope: "openid",
          code_challenge: "abc123abc123abc123abc123abc123abc123abc123",
          code_challenge_method: CodeChallengeMethod.S256,
        },
      },
      { headers: { origin: "https://example.com" } },
    );
    expect(initial.status).toBe(302);
    const loginLocation = new URL(
      initial.headers.get("location")!,
      "http://localhost:3000",
    );
    const loginSessionId = loginLocation.searchParams.get("state");
    expect(loginSessionId).toBeTruthy();

    counting.value!.reset();

    // The widget redirects back with connection + state — the request from
    // the production trace. Floor on the warm path:
    //   1 × loginSessions.get  (state hydration; reused by connectionAuth)
    //   1 × codes.create       (the oauth2_state row — intentionally a DB
    //                           write, not a stateless token)
    //   0 × everything else against the raw adapter.
    const response = await client.authorize.$get(
      {
        query: {
          client_id: "clientId",
          connection: "mock-strategy",
          response_type: AuthorizationResponseType.CODE,
          redirect_uri: "https://example.com/callback",
          state: loginSessionId!,
          scope: "openid",
        },
      },
      { headers: { origin: "https://example.com" } },
    );

    // Must be the redirect to the external IdP, not an error page.
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "https://example.com/authorize",
    );

    const counts = counting.value!.counts;

    // The two irreducible per-request data calls.
    expect(counts["loginSessions.get"] ?? 0).toBe(1);
    expect(counts["codes.create"] ?? 0).toBe(1);
    // The session existed — no fallback create.
    expect(counts["loginSessions.create"] ?? 0).toBe(0);

    // Middleware must not run host-based fallbacks: /authorize resolves its
    // tenant from client_id, so single-tenant auto-detect is skipped.
    expect(counts["tenants.list"] ?? 0).toBe(0);
    expect(counts["customDomains.getByDomain"] ?? 0).toBe(0);

    // All per-(tenant, client) config comes from the warm bundle / L2 cache.
    expect(counts["tenants.get"] ?? 0).toBe(0);
    expect(counts["clients.get"] ?? 0).toBe(0);
    expect(counts["clients.getByClientId"] ?? 0).toBe(0);
    expect(counts["connections.list"] ?? 0).toBe(0);
    expect(counts["clientConnections.listByClient"] ?? 0).toBe(0);
    expect(counts["resourceServers.list"] ?? 0).toBe(0);
  });

  it("warm-cache /authorize/resume completes an authenticated session with the minimal data calls", async () => {
    const counting = {
      value: undefined as ReturnType<typeof countingAdapter> | undefined,
    };
    const { oauthApp, env } = await getTestServer({
      persistentCache: true,
      wrapDataAdapter: (data) => {
        const c = countingAdapter(data);
        counting.value = c;
        return c.wrapped;
      },
    });
    const client = testClient(oauthApp, env);

    // First /authorize — warms the bundle and creates the login session,
    // exactly as the universal-login flow would.
    const initial = await client.authorize.$get(
      {
        query: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.CODE,
          redirect_uri: "https://example.com/callback",
          state: "client-state",
          scope: "openid",
          code_challenge: "abc123abc123abc123abc123abc123abc123abc123",
          code_challenge_method: CodeChallengeMethod.S256,
        },
      },
      { headers: { origin: "https://example.com" } },
    );
    expect(initial.status).toBe(302);
    const loginSessionId = new URL(
      initial.headers.get("location")!,
      "http://localhost:3000",
    ).searchParams.get("state");
    expect(loginSessionId).toBeTruthy();

    // Simulate a completed sub-flow: a session row exists and the login
    // session is AUTHENTICATED — the state /authorize/resume dispatches on.
    await env.data.sessions.create("tenantId", {
      id: "resume-session",
      user_id: "email|userId",
      clients: ["clientId"],
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      used_at: new Date().toISOString(),
      login_session_id: loginSessionId!,
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
    });
    await env.data.loginSessions.update("tenantId", loginSessionId!, {
      state: LoginSessionState.AUTHENTICATED,
      user_id: "email|userId",
      session_id: "resume-session",
      authenticated_at: new Date().toISOString(),
    });

    counting.value!.reset();

    const response = await client.authorize.resume.$get({
      query: { state: loginSessionId! },
    });

    // Must be the final hop: 302 to the client's redirect_uri with a code.
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe("https://example.com");
    expect(location.searchParams.get("code")).toBeTruthy();
    expect(location.searchParams.get("state")).toBe("client-state");

    const counts = counting.value!.counts;

    // Floor on the warm path:
    //   2 × loginSessions.get    (resume.ts state lookup + the single
    //                             optimistic-concurrency re-read in
    //                             createFrontChannelAuthResponse — the MFA /
    //                             consent / nudge checks and
    //                             completeLoginSession reuse that object)
    //   1 × loginSessions.update (state → COMPLETED)
    //   1 × users.get            (rehydrate the authenticated user)
    //   1 × codes.create         (the authorization code)
    expect(counts["loginSessions.get"] ?? 0).toBe(2);
    expect(counts["loginSessions.update"] ?? 0).toBe(1);
    expect(counts["codes.create"] ?? 0).toBe(1);

    // The last-login bookkeeping write still happens (deferred via
    // waitUntil; the test runner flushes it before the response leaves).
    // Its user-update decorator chain reads the user once more (the second
    // users.get) and commits the write inside data.transaction() — whose
    // inner adapter the counting wrapper intentionally bypasses, so
    // users.update itself never shows up in counts. Both ride along in the
    // deferred promise, off the response path on Workers.
    expect(counts["users.get"] ?? 0).toBe(2);
    expect(counts["transaction()"] ?? 0).toBe(1);

    // Middleware fallbacks must not fire: resume resolves its tenant from
    // the state artifact (single-tenant auto-detect is skipped).
    expect(counts["tenants.list"] ?? 0).toBe(0);
    // One custom-domain probe is allowed: the testClient request URL host
    // ("localhost") differs from the issuer-fallback host the resume request
    // resolves ("localhost:3000"), so the cross-domain trust check in
    // resume.ts runs its single lookup — mirroring the one per-request probe
    // a custom-domain deployment pays in the tenant middleware.
    expect(counts["customDomains.getByDomain"] ?? 0).toBeLessThanOrEqual(1);

    // All per-(tenant, client) config comes from the warm bundle / L2 cache —
    // resume stamps (tenant_id, client_id) on the context before fetching the
    // enriched client so these reads route through the bundle.
    expect(counts["tenants.get"] ?? 0).toBe(0);
    expect(counts["clients.get"] ?? 0).toBe(0);
    expect(counts["clients.getByClientId"] ?? 0).toBe(0);
    expect(counts["connections.list"] ?? 0).toBe(0);
    expect(counts["clientConnections.listByClient"] ?? 0).toBe(0);
    expect(counts["resourceServers.list"] ?? 0).toBe(0);

    // The deferred user-update decorator reads the tenant's hooks through
    // the raw adapter (it sits below the bundle layer) — rides in the same
    // deferred promise as the last-login write.
    expect(counts["hooks.list"] ?? 0).toBeLessThanOrEqual(1);

    // The post-login event object reads the user's roles once (L2-cached
    // across requests after the first login).
    expect(counts["userRoles.list"] ?? 0).toBeLessThanOrEqual(1);
  });
});
