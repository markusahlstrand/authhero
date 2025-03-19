import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";

describe("check account", () => {
  it("should redirect to login if there is no session", async () => {
    const { universalApp, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    const authorizeResponse = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        state: "state",
        nonce: "nonce",
        scope: "openid email profile",
      },
    });

    expect(authorizeResponse.status).toBe(302);

    const location = authorizeResponse.headers.get("location");
    const universalUrl = new URL(`https://example.com${location}`);
    const state = universalUrl.searchParams.get("state");
    if (!state) {
      throw new Error("No state found");
    }

    // --------------------------------
    // check account without session
    // --------------------------------
    const enterEmailGetResponse = await universalClient["check-account"].$get({
      query: { state },
    });
    expect(enterEmailGetResponse.status).toBe(302);

    const loginLocation = enterEmailGetResponse.headers.get("location");
    expect(loginLocation).toContain(`/u/enter-email?state=${state}`);
  });

  it("should return a code if there is a session", async () => {
    const { universalApp, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    // Create the login session and the session
    const session = await env.data.sessions.create("tenantId", {
      id: "sessionId",
      user_id: "email|userId",
      clients: ["clientId"],
      expires_at: new Date(Date.now() + 1000).toISOString(),
      used_at: new Date().toISOString(),
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
    });

    const loginSesssion = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
      csrf_token: "csrfToken",
      session_id: session.id,
      authParams: {
        client_id: "clientId",
        username: "foo@exampl.com",
        scope: "",
        audience: "http://example.com",
        redirect_uri: "http://example.com/callback",
      },
    });

    const authorizeResponse = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "state",
          nonce: "nonce",
          scope: "openid email profile",
        },
      },
      {
        headers: {
          cookie: "tenantId-auth-token=sessionId",
        },
      },
    );

    expect(authorizeResponse.status).toBe(302);

    const autrorizeLocation = authorizeResponse.headers.get("location");
    const universalUrl = new URL(`https://example.com${autrorizeLocation}`);

    expect(universalUrl.pathname).toBe("/u/check-account");

    const state = universalUrl.searchParams.get("state");
    if (!state) {
      throw new Error("No state found");
    }

    // --------------------------------
    // get check account
    // --------------------------------
    const checkAccountGetResponse = await universalClient["check-account"].$get(
      {
        query: { state },
      },
      {
        headers: {
          cookie: "tenantId-auth-token=sessionId",
        },
      },
    );

    expect(checkAccountGetResponse.status).toBe(200);

    // --------------------------------
    // post check account
    // --------------------------------
    const checkAccountPostResponse = await universalClient[
      "check-account"
    ].$post(
      {
        query: { state },
      },
      {
        headers: {
          cookie: "tenantId-auth-token=sessionId",
        },
      },
    );

    expect(checkAccountPostResponse.status).toBe(302);

    const checkAccountPostLocation = new URL(
      checkAccountPostResponse.headers.get("location")!,
    );

    const codeQueryString = checkAccountPostLocation.searchParams.get("code");

    const code = await env.data.codes.get(
      "tenantId",
      codeQueryString!,
      "authorization_code",
    );
    expect(code).not.toBe(null);
  });
});
