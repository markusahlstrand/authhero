import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import {
  AuthorizationResponseMode,
  AuthorizationResponseType,
} from "@authhero/adapter-interfaces";
import { CodeChallengeMethod } from "@authhero/adapter-interfaces";

describe("authorize", () => {
  it("should return a 403 if the origin isn't valid", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com",
          state: "state",
        },
      },
      {
        headers: {
          origin: "https://invalid.org",
        },
      },
    );

    expect(response.status).toEqual(403);
    const responseText = await response.text();
    expect(responseText).toEqual("Origin https://invalid.org not allowed");
  });

  it("should redirect with invalid_request error when response_type is missing", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "test-state",
        },
      },
      {
        headers: {
          origin: "https://example.com",
        },
      },
    );

    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    expect(location).toBeTruthy();

    const redirectUrl = new URL(location!);
    expect(redirectUrl.origin + redirectUrl.pathname).toEqual(
      "https://example.com/callback",
    );
    expect(redirectUrl.searchParams.get("error")).toEqual("invalid_request");
    expect(redirectUrl.searchParams.get("error_description")).toEqual(
      "Missing required parameter: response_type",
    );
    expect(redirectUrl.searchParams.get("state")).toEqual("test-state");
  });

  it("should throw 400 error when response_type is missing and no redirect_uri", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          // @ts-ignore - intentionally testing with empty redirect_uri
          redirect_uri: "",
          state: "test-state",
        },
      },
      {
        headers: {
          origin: "https://example.com",
        },
      },
    );

    expect(response.status).toEqual(400);
    const responseText = await response.text();
    expect(responseText).toContain("Missing required parameter: response_type");
  });

  it("should return a redirect to the universal login", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "state",
          ui_locales: "en",
          scope: "openid email profile",
          // This is a temporary workaround until we have a better way to handle this
          vendor_id: "vendorId",
          response_mode: AuthorizationResponseMode.QUERY,
          response_type: AuthorizationResponseType.CODE,
          auth0Client:
            "eyJuYW1lIjoiYXV0aDAtc3BhLWpzIiwidmVyc2lvbiI6IjIuMS4zIn0=",
          organization: "organization",
          // @ts-ignore
          firstName: "firstName",
        },
      },
      {
        headers: {
          origin: "https://example.com",
        },
      },
    );

    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    const redirectUri = new URL("https://example.com" + location);

    // Validate the redirect uri
    expect(redirectUri.pathname).toEqual("/u/login/identifier");

    // Fetch the login session
    const login = await env.data.loginSessions.get(
      "clientId",
      redirectUri.searchParams.get("state")!,
    );

    if (!login) {
      throw new Error("Login session not found");
    }

    expect(login.authParams).toEqual({
      client_id: "clientId",
      redirect_uri: "https://example.com/callback",
      response_type: AuthorizationResponseType.CODE,
      response_mode: AuthorizationResponseMode.QUERY,
      scope: "openid email profile",
      vendor_id: "vendorId",
      state: "state",
      ui_locales: "en",
      organization: "organization",
    });
    expect(login.auth0Client).toBe("auth0-spa-js/2.1.3");

    if (!login.authorization_url) {
      throw new Error("Authorization URL not set");
    }

    const authorizationUrl = new URL(login.authorization_url);
    expect(authorizationUrl.searchParams.get("firstName")).toEqual("firstName");
  });

  it("should not store fragments in redirect_uri according to RFC 6749 section 3.1.2", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri:
            "https://example.com/callback#fragment-should-not-be-stored",
          state: "state",
          ui_locales: "en",
          scope: "openid email profile",
          vendor_id: "vendorId",
          response_mode: AuthorizationResponseMode.QUERY,
          response_type: AuthorizationResponseType.CODE,
          auth0Client:
            "eyJuYW1lIjoiYXV0aDAtc3BhLWpzIiwidmVyc2lvbiI6IjIuMS4zIn0=",
          organization: "organization",
        },
      },
      {
        headers: {
          origin: "https://example.com",
        },
      },
    );

    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    const redirectUri = new URL("https://example.com" + location);

    // Fetch the login session
    const login = await env.data.loginSessions.get(
      "clientId",
      redirectUri.searchParams.get("state")!,
    );

    if (!login) {
      throw new Error("Login session not found");
    }

    // Verify that the fragment is not stored in the redirect_uri
    // According to RFC 6749 section 3.1.2, the fragment component should not be included
    expect(login.authParams.redirect_uri).toEqual(
      "https://example.com/callback",
    );
    expect(login.authParams.redirect_uri).not.toContain(
      "#fragment-should-not-be-stored",
    );
  });

  it("should strip OAuth error and code params from redirect_uri to prevent stale params", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Simulate a user starting a new login from a page that has error params from a previous failed attempt
    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri:
            "https://example.com/callback?error=access_denied&error_description=Login+session+closed&code=old_code&state=old_state",
          state: "new_state",
          scope: "openid",
          response_type: AuthorizationResponseType.CODE,
        },
      },
      {
        headers: {
          origin: "https://example.com",
        },
      },
    );

    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    const redirectUri = new URL("https://example.com" + location);

    // Fetch the login session
    const login = await env.data.loginSessions.get(
      "clientId",
      redirectUri.searchParams.get("state")!,
    );

    if (!login) {
      throw new Error("Login session not found");
    }

    // Verify that OAuth params are stripped from redirect_uri
    expect(login.authParams.redirect_uri).toEqual(
      "https://example.com/callback",
    );
    expect(login.authParams.redirect_uri).not.toContain("error");
    expect(login.authParams.redirect_uri).not.toContain("code");
    expect(login.authParams.redirect_uri).not.toContain("old_state");
  });

  describe("silent authentication", () => {
    it("should return a web_message response with login required if no valid session exists", async () => {
      const { oauthApp, env } = await getTestServer();
      const oauthClient = testClient(oauthApp, env);

      const response = await oauthClient.authorize.$get(
        {
          query: {
            client_id: "clientId",
            redirect_uri: "https://example.com/callback",
            state: "state",
            nonce: "nonce",
            code_challenge: "codeChallenge",
            code_challenge_method: CodeChallengeMethod.S256,
            scope: "openid email profile",
            prompt: "none",
            response_mode: AuthorizationResponseMode.WEB_MESSAGE,
            response_type: AuthorizationResponseType.CODE,
          },
        },
        {
          headers: {
            origin: "https://example.com",
          },
        },
      );

      expect(response.status).toEqual(200);
      const body = await response.text();
      expect(body).toContain("login_required");
    });

    it("should return a web_message response with a code for a valid session", async () => {
      const { oauthApp, env } = await getTestServer();
      const oauthClient = testClient(oauthApp, env);

      const idle_expires_at = new Date(Date.now() + 1000).toISOString();

      const loginSession = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(), // 1 hour from now
        csrf_token: "csrfToken",
        authParams: {
          client_id: "clientId",
          username: "foo@example.com",
          redirect_uri: "https://example.com/callback",
        },
      });

      await env.data.sessions.create("tenantId", {
        id: "sessionId",
        user_id: "email|userId",
        clients: ["clientId"],
        idle_expires_at,
        login_session_id: loginSession.id,
        device: {
          last_ip: "",
          initial_ip: "",
          last_user_agent: "",
          initial_user_agent: "",
          initial_asn: "",
          last_asn: "",
        },
      });

      const response = await oauthClient.authorize.$get(
        {
          query: {
            client_id: "clientId",
            redirect_uri: "https://example.com/callback",
            state: "state",
            nonce: "nonce",
            code_challenge: "codeChallenge",
            code_challenge_method: CodeChallengeMethod.S256,
            scope: "openid email profile",
            prompt: "none",
            response_mode: AuthorizationResponseMode.WEB_MESSAGE,
            response_type: AuthorizationResponseType.CODE,
          },
        },
        {
          headers: {
            origin: "https://example.com",
            cookie: "tenantId-auth-token=sessionId",
          },
        },
      );

      expect(response.status).toEqual(200);
      const body = await response.text();
      expect(body).toContain('"code":"');
      const codeMatch = body.match(/"code":"([^"]+)"/);

      // Fetch the session
      const session = await env.data.sessions.get("tenantId", "sessionId");
      expect(session?.used_at).toBeDefined();
      expect(session?.idle_expires_at).not.toBe(idle_expires_at);

      // Fetch the code
      const code = await env.data.codes.get(
        "tenantId",
        codeMatch?.[1] || "",
        "authorization_code",
      );

      expect(code).toMatchObject({
        code_type: "authorization_code",
        user_id: "email|userId",
        // The code should now be linked to a NEW login session created during silent auth
        login_id: expect.any(String),
        expires_at: expect.any(String),
        code_challenge: "codeChallenge",
        code_challenge_method: CodeChallengeMethod.S256,
        state: "state",
        nonce: "nonce",
        redirect_uri: "https://example.com/callback",
      });

      // Verify the new login session was created and linked to the current session
      const newLoginSession = await env.data.loginSessions.get("tenantId", code?.login_id || "");
      expect(newLoginSession).toBeDefined();
      expect(newLoginSession?.session_id).toEqual(session?.id);
      expect(newLoginSession?.authParams.client_id).toEqual("clientId");
    });

    it("should return a web_message response with a access_token for a valid session", async () => {
      const { oauthApp, env } = await getTestServer();
      const oauthClient = testClient(oauthApp, env);

      const idle_expires_at = new Date(Date.now() + 1000).toISOString();

      const loginSession = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(), // 1 hour from now
        csrf_token: "csrfToken",
        authParams: {
          client_id: "clientId",
          username: "foo@example.com",
          redirect_uri: "https://example.com/callback",
        },
      });

      await env.data.sessions.create("tenantId", {
        id: "sessionId",
        user_id: "email|userId",
        clients: ["clientId"],
        idle_expires_at,
        login_session_id: loginSession.id,
        device: {
          last_ip: "",
          initial_ip: "",
          last_user_agent: "",
          initial_user_agent: "",
          initial_asn: "",
          last_asn: "",
        },
      });

      const response = await oauthClient.authorize.$get(
        {
          query: {
            client_id: "clientId",
            redirect_uri: "https://example.com/callback",
            state: "state",
            nonce: "nonce",
            code_challenge: "codeChallenge",
            code_challenge_method: CodeChallengeMethod.S256,
            scope: "openid email profile",
            prompt: "none",
            response_mode: AuthorizationResponseMode.WEB_MESSAGE,
            response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
          },
        },
        {
          headers: {
            origin: "https://example.com",
            cookie: "tenantId-auth-token=sessionId",
          },
        },
      );

      expect(response.status).toEqual(200);
      const body = await response.text();
      expect(body).toContain("id_token");

      // Fetch the session
      const session = await env.data.sessions.get("tenantId", "sessionId");
      expect(session?.used_at).toBeDefined();
      expect(session?.idle_expires_at).not.toBe(idle_expires_at);
    });

    it("should return a web_message response with login required for a expired session", async () => {
      const { oauthApp, env } = await getTestServer();
      const oauthClient = testClient(oauthApp, env);

      const loginSession = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(), // 1 hour from now
        csrf_token: "csrfToken",
        authParams: {
          client_id: "clientId",
          username: "foo@example.com",
          redirect_uri: "https://example.com/callback",
        },
      });

      await env.data.sessions.create("tenantId", {
        id: "sessionId",
        user_id: "email|userId",
        clients: ["clientId"],
        expires_at: new Date(Date.now() - 1000).toISOString(),
        login_session_id: loginSession.id,
        device: {
          last_ip: "",
          initial_ip: "",
          last_user_agent: "",
          initial_user_agent: "",
          initial_asn: "",
          last_asn: "",
        },
      });

      const response = await oauthClient.authorize.$get(
        {
          query: {
            client_id: "clientId",
            redirect_uri: "https://example.com/callback",
            state: "state",
            nonce: "nonce",
            code_challenge: "codeChallenge",
            code_challenge_method: CodeChallengeMethod.S256,
            scope: "openid email profile",
            prompt: "none",
            response_mode: AuthorizationResponseMode.WEB_MESSAGE,
            response_type: AuthorizationResponseType.CODE,
          },
        },
        {
          headers: {
            origin: "https://example.com",
            cookie: "tenantId-auth-token=sessionId",
          },
        },
      );

      expect(response.status).toEqual(200);
      const body = await response.text();
      expect(body).toContain("login_required");
    });
  });

  it("should link existing session to new login session when login_hint matches", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Create an initial login session and session (properly linked)
    const initialLoginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "initialCsrfToken",
      authParams: {
        client_id: "clientId",
      },
    });

    const existingSession = await env.data.sessions.create("tenantId", {
      id: "existingSessionId",
      user_id: "email|userId",
      login_session_id: initialLoginSession.id,
      clients: ["clientId"],
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
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

    // Start a new authorization flow with login_hint matching the user's email
    // This should create a NEW login session but reuse the existing session
    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "state",
          nonce: "nonce",
          scope: "openid email profile",
          response_type: AuthorizationResponseType.CODE,
          login_hint: "foo@example.com", // This matches the user's email
        },
      },
      {
        headers: {
          cookie: "tenantId-auth-token=existingSessionId",
          origin: "https://example.com",
        },
      },
    );

    expect(response.status).toBe(302);

    const location = response.headers.get("location");
    if (!location) {
      throw new Error("No location header");
    }

    const redirectUri = new URL(location);
    expect(redirectUri.pathname).toBe("/callback");
    
    const code = redirectUri.searchParams.get("code");
    if (!code) {
      throw new Error("No code found in redirect uri");
    }

    // Verify the code was created
    const dbCode = await env.data.codes.get("tenantId", code, "authorization_code");
    expect(dbCode).not.toBeNull();

    // Get the NEW login session that was created for this authorization flow
    const newLoginSessionId = dbCode?.login_id;
    expect(newLoginSessionId).toBeDefined();
    expect(newLoginSessionId).not.toBe(initialLoginSession.id); // Should be different from the initial one

    const newLoginSession = await env.data.loginSessions.get("tenantId", newLoginSessionId!);
    expect(newLoginSession).not.toBeNull();

    // Verify that the existing session is linked to the NEW login session
    expect(newLoginSession?.session_id).toBe("existingSessionId");

    // Verify that the existing session still exists and hasn't been duplicated
    const sessionAfter = await env.data.sessions.get("tenantId", "existingSessionId");
    expect(sessionAfter).not.toBeNull();
    expect(sessionAfter?.id).toBe("existingSessionId");
  });
});
