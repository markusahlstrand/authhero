import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { countingAdapter } from "../../helpers/counting-adapter";

/**
 * Regression guard for /oauth/token: bundle-covered config reads should
 * collapse to ≤1× per entity per request, and to 0× on the warm path.
 *
 * Test grant: `client_credentials` — the simplest token grant. Other grants
 * (authorization_code, refresh_token, password) involve more transactional
 * reads (codes, refreshTokens, users); those are intentionally NOT bundle-
 * covered. The bundle-covered slice should behave the same way regardless
 * of grant.
 */
describe("token — adapter call counts", () => {
  it("cold-cache /oauth/token (client_credentials) reads each bundle entity ≤1×", async () => {
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
    counting.value!.reset();

    const response = await client.oauth.token.$post(
      // @ts-expect-error - testClient typing wants both form and json
      {
        form: {
          grant_type: "client_credentials",
          client_id: "clientId",
          client_secret: "clientSecret",
          audience: "https://example.com",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    // Assert the warm path actually issued a token before checking call counts
    // — a 4xx early-exit would otherwise satisfy the "≤1×" assertions below
    // without exercising the cached bundle.
    expect(response.status).toBe(200);
    const body = (await response.json()) as { access_token?: string };
    expect(body.access_token).toBeTruthy();

    const counts = counting.value!.counts;

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

  it("warm-cache /oauth/token hits zero bundle-covered reads", async () => {
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

    // First request — warms the bundle.
    await client.oauth.token.$post(
      // @ts-expect-error - testClient typing wants both form and json
      {
        form: {
          grant_type: "client_credentials",
          client_id: "clientId",
          client_secret: "clientSecret",
          audience: "https://example.com",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    counting.value!.reset();

    // Second request — bundle in cache; raw should never be touched for
    // any bundle-covered entity.
    const response = await client.oauth.token.$post(
      // @ts-expect-error - testClient typing wants both form and json
      {
        form: {
          grant_type: "client_credentials",
          client_id: "clientId",
          client_secret: "clientSecret",
          audience: "https://example.com",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    // The warm request must have issued a token for the zero-read assertions
    // below to be meaningful.
    expect(response.status).toBe(200);
    const body = (await response.json()) as { access_token?: string };
    expect(body.access_token).toBeTruthy();

    const counts = counting.value!.counts;
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
});
