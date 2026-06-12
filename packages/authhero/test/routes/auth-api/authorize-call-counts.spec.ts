import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { countingAdapter } from "../../helpers/counting-adapter";
import {
  AuthorizationResponseType,
  CodeChallengeMethod,
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
    const counting = { value: undefined as ReturnType<typeof countingAdapter> | undefined };
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
    const counting = { value: undefined as ReturnType<typeof countingAdapter> | undefined };
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
});
