import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { createSessions } from "../../helpers/create-session";

describe("logout", () => {
  it("should clear a session cookie and redirect to the returnTo url", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const response = await client.v2.logout.$get({
      query: {
        client_id: "clientId",
        returnTo: "https://example.com/callback",
      },
    });

    expect(response.status).toBe(302);

    const location = response.headers.get("location");
    expect(location).toBe("https://example.com/callback");

    const cookies = response.headers.get("set-cookie");
    // Double-Clear: Should have both non-partitioned clear and partitioned clear
    expect(cookies).toContain(
      "tenantId-auth-token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None",
    );
    expect(cookies).toContain(
      "tenantId-auth-token=; Max-Age=0; Path=/; HttpOnly; Secure; Partitioned; SameSite=None",
    );
  });

  it("should return a 200 OK if the clientId isn't found", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const response = await client.v2.logout.$get({
      query: {
        client_id: "invalidClientId",
        returnTo: "https://example/callback",
      },
    });

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toBe("OK");
  });

  it("should return a 400 OK if the callback isn't allowed", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const response = await client.v2.logout.$get({
      query: {
        client_id: "clientId",
        returnTo: "https://example/invalid-callback",
      },
    });

    expect(response.status).toBe(400);
    const body = await response.text();
    expect(body).toBe("Invalid redirect uri");
  });

  it("should clear a remove session from the database and create a log message", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    // Use the helper to create sessions
    const { session } = await createSessions(env.data);

    // Create a refresh token
    await env.data.refreshTokens.create("tenantId", {
      id: "refreshToken",
      session_id: session.id,
      user_id: "email|userId",
      client_id: "clientId",
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
    });

    await client.v2.logout.$get(
      {
        query: {
          client_id: "clientId",
          returnTo: "https://example.com/callback",
        },
      },
      {
        headers: {
          cookie: `tenantId-auth-token=${session.id}`,
        },
      },
    );

    const sessionAfter = await env.data.sessions.get("tenantId", session.id);
    expect(sessionAfter?.revoked_at).toBeTypeOf("string");

    const refreshtokens = await env.data.refreshTokens.list("tenantId", {
      q: `session_id:${session.id}`,
      include_totals: false,
      per_page: 1,
      page: 0,
    });

    expect(refreshtokens.length).toBe(0);

    const { logs } = await env.data.logs.list("tenantId");
    expect(logs.length).toBe(1);
  });
});
