import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";

interface ErrorResponse {
  error: string;
  error_description?: string;
}

const baseRefreshTokenFields = {
  login_id: "loginSessionId",
  user_id: "email|userId",
  resource_servers: [
    {
      audience: "http://example.com",
      scopes: "openid",
    },
  ],
  device: {
    last_ip: "",
    initial_ip: "",
    last_user_agent: "",
    initial_user_agent: "",
    initial_asn: "",
    last_asn: "",
  },
  rotating: false,
};

function futureIso(ms = 60 * 60 * 1000) {
  return new Date(Date.now() + ms).toISOString();
}

describe("/oauth/revoke", () => {
  it("revokes a refresh token belonging to the authenticating client (RFC 7009 §2.1)", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const expires = futureIso();
    await env.data.refreshTokens.create("tenantId", {
      ...baseRefreshTokenFields,
      id: "rtToRevoke",
      client_id: "clientId",
      idle_expires_at: expires,
      expires_at: expires,
    });

    const response = await client.oauth.revoke.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          token: "rtToRevoke",
          client_id: "clientId",
          client_secret: "clientSecret",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const stored = await env.data.refreshTokens.get("tenantId", "rtToRevoke");
    expect(stored?.revoked_at).toBeTruthy();
  });

  it("returns 200 without revoking when the token belongs to a different client (§2.2)", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    await env.data.clients.create("tenantId", {
      client_id: "otherClient",
      client_secret: "otherClientSecret",
      name: "Other Client",
      callbacks: ["https://example.com/callback"],
      allowed_logout_urls: ["https://example.com/callback"],
      web_origins: ["https://example.com"],
    });

    const expires = futureIso();
    await env.data.refreshTokens.create("tenantId", {
      ...baseRefreshTokenFields,
      id: "rtForOther",
      client_id: "otherClient",
      idle_expires_at: expires,
      expires_at: expires,
    });

    const response = await client.oauth.revoke.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          token: "rtForOther",
          client_id: "clientId",
          client_secret: "clientSecret",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    expect(response.status).toBe(200);

    const stored = await env.data.refreshTokens.get("tenantId", "rtForOther");
    expect(stored?.revoked_at).toBeFalsy();
  });

  it("returns 200 for an unknown token (§2.2 — no token-scanning oracle)", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const response = await client.oauth.revoke.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          token: "doesNotExist",
          client_id: "clientId",
          client_secret: "clientSecret",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    expect(response.status).toBe(200);
  });

  it("returns 401 invalid_client when client_secret is wrong", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const response = await client.oauth.revoke.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          token: "anything",
          client_id: "clientId",
          client_secret: "wrong",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toBe("invalid_client");
  });

  it("accepts client credentials via Basic auth header", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const expires = futureIso();
    await env.data.refreshTokens.create("tenantId", {
      ...baseRefreshTokenFields,
      id: "rtViaBasic",
      client_id: "clientId",
      idle_expires_at: expires,
      expires_at: expires,
    });

    const response = await client.oauth.revoke.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: { token: "rtViaBasic" },
      },
      {
        headers: {
          "tenant-id": "tenantId",
          authorization: "Basic " + btoa("clientId:clientSecret"),
        },
      },
    );

    expect(response.status).toBe(200);
    const stored = await env.data.refreshTokens.get("tenantId", "rtViaBasic");
    expect(stored?.revoked_at).toBeTruthy();
  });

  it("does not look up the token when token_type_hint=access_token", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const expires = futureIso();
    await env.data.refreshTokens.create("tenantId", {
      ...baseRefreshTokenFields,
      id: "rtThatLooksLikeAT",
      client_id: "clientId",
      idle_expires_at: expires,
      expires_at: expires,
    });

    const response = await client.oauth.revoke.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          token: "rtThatLooksLikeAT",
          token_type_hint: "access_token",
          client_id: "clientId",
          client_secret: "clientSecret",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    expect(response.status).toBe(200);
    const stored = await env.data.refreshTokens.get(
      "tenantId",
      "rtThatLooksLikeAT",
    );
    // The hint pointed at access_token, so the refresh-token store is not touched.
    expect(stored?.revoked_at).toBeFalsy();
  });

  it("blocks the revoked refresh token from subsequent token exchanges", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const expires = futureIso();
    await env.data.refreshTokens.create("tenantId", {
      ...baseRefreshTokenFields,
      id: "rtThenTokenExchange",
      client_id: "clientId",
      idle_expires_at: expires,
      expires_at: expires,
    });

    const revoke = await client.oauth.revoke.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          token: "rtThenTokenExchange",
          client_id: "clientId",
          client_secret: "clientSecret",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );
    expect(revoke.status).toBe(200);

    const exchange = await client.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: "refresh_token",
          refresh_token: "rtThenTokenExchange",
          client_id: "clientId",
          client_secret: "clientSecret",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    expect([400, 403]).toContain(exchange.status);
    const body = (await exchange.json()) as ErrorResponse;
    expect(body.error).toBe("invalid_grant");
  });
});
