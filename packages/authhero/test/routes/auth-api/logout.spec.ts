import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";

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

    const cookie = response.headers.get("set-cookie");
    expect(cookie).toBe(
      "tenantId-auth-token=; HttpOnly; Max-Age=0; Path=/; SameSite=None; Secure",
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

    await env.data.sessions.create("tenantId", {
      id: "sid",
      clients: ["clientId"],
      user_id: "email|userId",
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
      used_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60 * 1000).toISOString(),
    });

    // Create the login session
    await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
      csrf_token: "csrfToken",
      session_id: "sid",
      authParams: {
        client_id: "clientId",
        username: "foo@exampl.com",
        scope: "",
        audience: "http://example.com",
        redirect_uri: "http://example.com/callback",
      },
    });

    // Create a refresh token
    await env.data.refreshTokens.create("tenantId", {
      id: "refreshToken",
      session_id: "sid",
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
          cookie: "tenantId-auth-token=sid",
        },
      },
    );

    const session = await env.data.sessions.get("tenantId", "sid");
    expect(session?.revoked_at).toBeTypeOf("string");

    const refreshtokens = await env.data.refreshTokens.list("tenantId", {
      q: "session_id:sid",
      include_totals: false,
      per_page: 1,
      page: 0,
    });

    expect(refreshtokens.length).toBe(0);

    const logs = await env.data.logs.list("tenantId");
    expect(logs.length).toBe(1);
  });
});
