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

  it("should hydrate missing params from an existing login session when only state+connection are provided (social-login redirect from universal-login widget)", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    await env.data.connections.create("tenantId", {
      id: "google-oauth2",
      name: "google-oauth2",
      strategy: "google-oauth2",
      options: {
        client_id: "clientId",
        client_secret: "clientSecret",
      },
    });

    // Pre-create a login session as if the user had already started a flow
    // and reached the universal-login screen.
    const existingSession = await env.data.loginSessions.create("tenantId", {
      csrf_token: "csrf-token",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        scope: "openid email profile",
        response_type: AuthorizationResponseType.CODE,
        state: "original-rp-state",
      },
    });

    // Widget builds /authorize?connection=X&state=Y&client_id=Z when the
    // user clicks a social button — without echoing response_type/redirect_uri.
    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          state: existingSession.id,
          connection: "google-oauth2",
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
    if (!location) throw new Error("No location header");
    const redirectUri = new URL(location);
    // Should redirect to Google's OAuth endpoint, not back with invalid_request
    expect(redirectUri.pathname).toEqual("/o/oauth2/v2/auth");
    expect(redirectUri.searchParams.get("error")).toBeNull();
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
      audience: "https://example.com",
    });
    expect(login.auth0Client).toBe("auth0-spa-js/2.1.3");

    if (!login.authorization_url) {
      throw new Error("Authorization URL not set");
    }

    const authorizationUrl = new URL(login.authorization_url);
    expect(authorizationUrl.searchParams.get("firstName")).toEqual("firstName");
  });

  it("should redirect to the universal login when the only connection is a database connection with strategy auth0", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Leave a single database connection stored with the canonical Auth0
    // strategy value. The single-connection shortcut in /authorize must not
    // treat it as a redirectable provider (getStrategy("auth0") would throw).
    await env.data.connections.remove("tenantId", "email");
    await env.data.connections.remove("tenantId", "mock-strategy");
    await env.data.connections.update(
      "tenantId",
      "Username-Password-Authentication",
      { strategy: "auth0" },
    );

    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "state",
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
    expect(redirectUri.pathname).toEqual("/u/login/identifier");
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

  it("should preserve redirect_uri exactly as received including query params", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Per RFC 6749, redirect_uri must be stored exactly for strict string comparison
    // at the token endpoint. Even if the URL has existing query params, we preserve them.
    const redirectUriWithParams =
      "https://example.com/callback?existing=param&another=value";

    // The redirect_uri (including its query string) must be registered — query
    // params are matched exactly, so register this exact URI as a callback.
    await env.data.clients.update("tenantId", "clientId", {
      callbacks: [
        "https://example.com/callback",
        "http://localhost:3000/*",
        redirectUriWithParams,
      ],
    });

    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: redirectUriWithParams,
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

    // Verify redirect_uri is preserved exactly (for strict string comparison at token endpoint)
    expect(login.authParams.redirect_uri).toEqual(redirectUriWithParams);
  });

  it("should preserve redirect_uri format without adding trailing slashes", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Test with path but no trailing slash - should NOT add trailing slash
    // Using http://localhost:3000 which matches the wildcard callback http://localhost:3000/*
    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: "http://localhost:3000/auth",
          state: "state",
          scope: "openid",
          response_type: AuthorizationResponseType.CODE,
        },
      },
      {
        headers: {
          origin: "http://localhost:3000",
        },
      },
    );

    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    const redirectUri = new URL("http://localhost:3000" + location);

    // Fetch the login session
    const login = await env.data.loginSessions.get(
      "clientId",
      redirectUri.searchParams.get("state")!,
    );

    if (!login) {
      throw new Error("Login session not found");
    }

    // Verify the redirect_uri is preserved exactly as provided (no trailing slash added)
    expect(login.authParams.redirect_uri).toEqual("http://localhost:3000/auth");
  });

  describe("response_mode validation", () => {
    it("redirects with unsupported_response_mode when query is combined with response_type=token", async () => {
      const { oauthApp, env } = await getTestServer();
      const oauthClient = testClient(oauthApp, env);

      const response = await oauthClient.authorize.$get(
        {
          query: {
            client_id: "clientId",
            redirect_uri: "https://example.com/callback",
            state: "state",
            scope: "openid",
            response_type: AuthorizationResponseType.TOKEN,
            response_mode: AuthorizationResponseMode.QUERY,
          },
        },
        {
          headers: {
            origin: "https://example.com",
          },
        },
      );

      expect(response.status).toEqual(302);
      const location = new URL(response.headers.get("location")!);
      expect(location.searchParams.get("error")).toEqual(
        "unsupported_response_mode",
      );
      expect(location.searchParams.get("error_description")).toEqual(
        'Invalid response_mode "query" for response_type "token"',
      );
      expect(location.searchParams.get("state")).toEqual("state");
      // The error must not create a login session
      expect(location.pathname).toEqual("/callback");
    });

    it("rejects query for hybrid response types carrying a token", async () => {
      const { oauthApp, env } = await getTestServer();
      const oauthClient = testClient(oauthApp, env);

      const response = await oauthClient.authorize.$get(
        {
          query: {
            client_id: "clientId",
            redirect_uri: "https://example.com/callback",
            state: "state",
            scope: "openid",
            response_type: AuthorizationResponseType.CODE_ID_TOKEN,
            response_mode: AuthorizationResponseMode.QUERY,
          },
        },
        {
          headers: {
            origin: "https://example.com",
          },
        },
      );

      expect(response.status).toEqual(302);
      const location = new URL(response.headers.get("location")!);
      expect(location.searchParams.get("error")).toEqual(
        "unsupported_response_mode",
      );
    });

    it("still allows response_mode=query with response_type=code", async () => {
      const { oauthApp, env } = await getTestServer();
      const oauthClient = testClient(oauthApp, env);

      const response = await oauthClient.authorize.$get(
        {
          query: {
            client_id: "clientId",
            redirect_uri: "https://example.com/callback",
            state: "state",
            scope: "openid",
            response_type: AuthorizationResponseType.CODE,
            response_mode: AuthorizationResponseMode.QUERY,
          },
        },
        {
          headers: {
            origin: "https://example.com",
          },
        },
      );

      expect(response.status).toEqual(302);
      const redirectUri = new URL(
        "http://localhost:3000" + response.headers.get("location"),
      );
      expect(redirectUri.pathname).toEqual("/u/login/identifier");
    });
  });

  describe("resource server validation", () => {
    it("redirects with access_denied when the audience doesn't match a resource server", async () => {
      const { oauthApp, env } = await getTestServer();
      const oauthClient = testClient(oauthApp, env);

      const response = await oauthClient.authorize.$get(
        {
          query: {
            client_id: "clientId",
            redirect_uri: "https://example.com/callback",
            state: "state",
            scope: "openid",
            response_type: AuthorizationResponseType.CODE,
            audience: "https://unregistered-api.example.com",
          },
        },
        {
          headers: {
            origin: "https://example.com",
          },
        },
      );

      expect(response.status).toEqual(302);
      const location = new URL(response.headers.get("location")!);
      expect(location.searchParams.get("error")).toEqual("access_denied");
      expect(location.searchParams.get("error_description")).toEqual(
        "Service not found: https://unregistered-api.example.com",
      );
    });

    it("allows the ${iss}userinfo sentinel resolved from tenant default_audience", async () => {
      const { oauthApp, env } = await getTestServer();
      const oauthClient = testClient(oauthApp, env);

      // The sentinel is a legitimate value the code produces itself (the
      // userinfo-only JWT path) and is intentionally not a resource server.
      await env.data.tenants.update("tenantId", {
        default_audience: "http://localhost:3000/userinfo",
      });

      const response = await oauthClient.authorize.$get(
        {
          query: {
            client_id: "clientId",
            redirect_uri: "https://example.com/callback",
            state: "state",
            scope: "openid",
            response_type: AuthorizationResponseType.CODE,
            // audience deliberately omitted — resolved from default_audience
          },
        },
        {
          headers: {
            origin: "https://example.com",
          },
        },
      );

      expect(response.status).toEqual(302);
      const redirectUri = new URL(
        "http://localhost:3000" + response.headers.get("location"),
      );
      expect(redirectUri.pathname).toEqual("/u/login/identifier");

      const login = await env.data.loginSessions.get(
        "clientId",
        redirectUri.searchParams.get("state")!,
      );
      expect(login?.authParams.audience).toEqual(
        "http://localhost:3000/userinfo",
      );
    });
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
      expect(
        new Date(session!.idle_expires_at).getTime(),
      ).toBeGreaterThanOrEqual(new Date(idle_expires_at).getTime());

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
      const newLoginSession = await env.data.loginSessions.get(
        "tenantId",
        code?.login_id || "",
      );
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
      expect(
        new Date(session!.idle_expires_at).getTime(),
      ).toBeGreaterThanOrEqual(new Date(idle_expires_at).getTime());
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

    it("should find valid session when multiple cookies with same name exist", async () => {
      const { oauthApp, env } = await getTestServer();
      const oauthClient = testClient(oauthApp, env);

      // Create a valid login session and session
      const loginSession = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        csrf_token: "csrfToken",
        authParams: {
          client_id: "clientId",
          username: "foo@example.com",
          redirect_uri: "https://example.com/callback",
        },
      });

      await env.data.sessions.create("tenantId", {
        id: "validSessionId",
        user_id: "email|userId",
        clients: ["clientId"],
        idle_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
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

      // Simulate cookie header with invalid session FIRST, valid session SECOND
      // This simulates the migration scenario where users have duplicate cookies
      // "invalidSessionId" doesn't exist, "validSessionId" does
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
            // First cookie is invalid (doesn't exist), second is valid
            cookie:
              "tenantId-auth-token=invalidSessionId; tenantId-auth-token=validSessionId",
          },
        },
      );

      expect(response.status).toEqual(200);
      const body = await response.text();
      // Should succeed with a code, not return login_required
      expect(body).toContain('"code":"');
      expect(body).not.toContain("login_required");
    });
  });

  it("should link existing session to new login session when login_hint matches", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Create an initial login session and session (properly linked)
    const initialLoginSession = await env.data.loginSessions.create(
      "tenantId",
      {
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        csrf_token: "initialCsrfToken",
        authParams: {
          client_id: "clientId",
        },
      },
    );

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
    const dbCode = await env.data.codes.get(
      "tenantId",
      code,
      "authorization_code",
    );
    expect(dbCode).not.toBeNull();

    // Get the NEW login session that was created for this authorization flow
    const newLoginSessionId = dbCode?.login_id;
    expect(newLoginSessionId).toBeDefined();
    expect(newLoginSessionId).not.toBe(initialLoginSession.id); // Should be different from the initial one

    const newLoginSession = await env.data.loginSessions.get(
      "tenantId",
      newLoginSessionId!,
    );
    expect(newLoginSession).not.toBeNull();

    // Verify that the existing session is linked to the NEW login session
    expect(newLoginSession?.session_id).toBe("existingSessionId");

    // Verify that the existing session still exists and hasn't been duplicated
    const sessionAfter = await env.data.sessions.get(
      "tenantId",
      "existingSessionId",
    );
    expect(sessionAfter).not.toBeNull();
    expect(sessionAfter?.id).toBe("existingSessionId");
  });

  describe("sso_disabled", () => {
    it("should return login_required for prompt=none when sso_disabled is true despite valid session", async () => {
      const { oauthApp, env } = await getTestServer();
      const oauthClient = testClient(oauthApp, env);

      // Update the client to have sso_disabled=true
      await env.data.clients.update("tenantId", "clientId", {
        sso_disabled: true,
      });

      const loginSession = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        csrf_token: "csrfToken",
        authParams: {
          client_id: "clientId",
          username: "foo@example.com",
          redirect_uri: "https://example.com/callback",
        },
      });

      await env.data.sessions.create("tenantId", {
        id: "ssoDisabledSessionId",
        user_id: "email|userId",
        clients: ["clientId"],
        idle_expires_at: new Date(Date.now() + 1000).toISOString(),
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
            cookie: "tenantId-auth-token=ssoDisabledSessionId",
          },
        },
      );

      expect(response.status).toEqual(200);
      const body = await response.text();
      expect(body).toContain("login_required");
    });

    it("should redirect to login when sso_disabled is true despite valid session", async () => {
      const { oauthApp, env } = await getTestServer();
      const oauthClient = testClient(oauthApp, env);

      // Update the client to have sso_disabled=true
      await env.data.clients.update("tenantId", "clientId", {
        sso_disabled: true,
      });

      const loginSession = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        csrf_token: "csrfToken",
        authParams: {
          client_id: "clientId",
          username: "foo@example.com",
          redirect_uri: "https://example.com/callback",
        },
      });

      await env.data.sessions.create("tenantId", {
        id: "ssoDisabledSessionId2",
        user_id: "email|userId",
        clients: ["clientId"],
        idle_expires_at: new Date(Date.now() + 1000).toISOString(),
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
            scope: "openid email profile",
            response_type: AuthorizationResponseType.CODE,
          },
        },
        {
          headers: {
            origin: "https://example.com",
            cookie: "tenantId-auth-token=ssoDisabledSessionId2",
          },
        },
      );

      // Should redirect to login, not to check-account
      expect(response.status).toEqual(302);
      const location = response.headers.get("location");
      expect(location).toContain("/u/login/identifier");
      expect(location).not.toContain("/check-account");
    });

    it("should reuse session for prompt=none when sso_disabled is false", async () => {
      const { oauthApp, env } = await getTestServer();
      const oauthClient = testClient(oauthApp, env);

      // Default test client has sso_disabled=false, but set explicitly for clarity
      await env.data.clients.update("tenantId", "clientId", {
        sso_disabled: false,
      });

      const loginSession = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        csrf_token: "csrfToken",
        authParams: {
          client_id: "clientId",
          username: "foo@example.com",
          redirect_uri: "https://example.com/callback",
        },
      });

      await env.data.sessions.create("tenantId", {
        id: "ssoEnabledSessionId",
        user_id: "email|userId",
        clients: ["clientId"],
        idle_expires_at: new Date(Date.now() + 1000).toISOString(),
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
            cookie: "tenantId-auth-token=ssoEnabledSessionId",
          },
        },
      );

      expect(response.status).toEqual(200);
      const body = await response.text();
      expect(body).toContain('"code":"');
    });
  });

  describe("screen_hint", () => {
    it("should skip check-account and go to login/identifier when screen_hint=login and a session exists", async () => {
      const { oauthApp, env } = await getTestServer();
      const oauthClient = testClient(oauthApp, env);

      const loginSession = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        csrf_token: "csrfToken",
        authParams: {
          client_id: "clientId",
          username: "foo@example.com",
          redirect_uri: "https://example.com/callback",
        },
      });

      await env.data.sessions.create("tenantId", {
        id: "screenHintSessionId",
        user_id: "email|userId",
        clients: ["clientId"],
        idle_expires_at: new Date(Date.now() + 1000).toISOString(),
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
            scope: "openid email profile",
            response_type: AuthorizationResponseType.CODE,
            screen_hint: "login",
          },
        },
        {
          headers: {
            origin: "https://example.com",
            cookie: "tenantId-auth-token=screenHintSessionId",
          },
        },
      );

      expect(response.status).toEqual(302);
      const location = response.headers.get("location");
      expect(location).toContain("/u/login/identifier");
      expect(location).not.toContain("/check-account");
    });

    it("should silently complete auth via SSO when a session exists and no screen_hint is provided", async () => {
      const { oauthApp, env } = await getTestServer();
      const oauthClient = testClient(oauthApp, env);

      const loginSession = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        csrf_token: "csrfToken",
        authParams: {
          client_id: "clientId",
          username: "foo@example.com",
          redirect_uri: "https://example.com/callback",
        },
      });

      await env.data.sessions.create("tenantId", {
        id: "silentSsoSessionId",
        user_id: "email|userId",
        clients: ["clientId"],
        idle_expires_at: new Date(Date.now() + 1000).toISOString(),
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
            scope: "openid email profile",
            response_type: AuthorizationResponseType.CODE,
          },
        },
        {
          headers: {
            origin: "https://example.com",
            cookie: "tenantId-auth-token=silentSsoSessionId",
          },
        },
      );

      expect(response.status).toEqual(302);
      const location = response.headers.get("location");
      expect(location).not.toContain("/check-account");
      const redirectUri = new URL(location!);
      expect(redirectUri.origin + redirectUri.pathname).toBe(
        "https://example.com/callback",
      );
      expect(redirectUri.searchParams.get("code")).toBeTruthy();
    });
  });
});
