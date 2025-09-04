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
    expect(loginLocation).toContain(`/u/login/identifier?state=${state}`);
  });

  it("should return a code if there is a session", async () => {
    const { universalApp, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    // Create the login session and the session
    const { id } = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
      },
    });

    const session = await env.data.sessions.create("tenantId", {
      id: "sessionId",
      login_session_id: id,
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

    await env.data.loginSessions.update("tenantId", id, {
      session_id: session.id,
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
    expect(code).not.toBe(null); // Make sure the session is set on the login session
    const loginSession = await env.data.loginSessions.get("tenantId", state);
    expect(loginSession).not.toBeNull();
    expect(loginSession?.session_id).toBeTypeOf("string");
  });

  it("should link a new login session to an existing session", async () => {
    const { universalApp, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    // Create an initial login session and session (properly linked)
    const initialLoginSession = await env.data.loginSessions.create(
      "tenantId",
      {
        expires_at: new Date(Date.now() + 1000).toISOString(),
        csrf_token: "initialCsrfToken",
        authParams: {
          client_id: "clientId",
        },
      },
    );

    await env.data.sessions.create("tenantId", {
      id: "existingSessionId",
      user_id: "email|userId",
      login_session_id: initialLoginSession.id,
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

    // Start a new authorization flow which will create a new login session
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
          cookie: "tenantId-auth-token=existingSessionId",
        },
      },
    );

    expect(authorizeResponse.status).toBe(302);

    const authorizeLocation = authorizeResponse.headers.get("location");
    const universalUrl = new URL(`https://example.com${authorizeLocation}`);
    const state = universalUrl.searchParams.get("state");
    if (!state) {
      throw new Error("No state found");
    }

    // At this point, we have a NEW login session (state) and an existing session (existingSessionId)
    // The NEW login session should NOT yet be linked to the existing session
    const loginSessionBefore = await env.data.loginSessions.get(
      "tenantId",
      state,
    );
    expect(loginSessionBefore?.session_id).toBeUndefined();

    // --------------------------------
    // post check account - this should link the existing session to the NEW login session
    // --------------------------------
    const checkAccountPostResponse = await universalClient[
      "check-account"
    ].$post(
      {
        query: { state },
      },
      {
        headers: {
          cookie: "tenantId-auth-token=existingSessionId",
        },
      },
    );

    expect(checkAccountPostResponse.status).toBe(302);

    // Verify that the NEW login session is now linked to the existing session
    const loginSessionAfter = await env.data.loginSessions.get(
      "tenantId",
      state,
    );
    expect(loginSessionAfter?.session_id).toBe("existingSessionId");

    // Verify that the existing session still exists and hasn't been duplicated
    const sessionAfter = await env.data.sessions.get(
      "tenantId",
      "existingSessionId",
    );
    expect(sessionAfter).not.toBeNull();
    expect(sessionAfter?.id).toBe("existingSessionId");
  });
});
