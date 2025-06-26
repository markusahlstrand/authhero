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
    expect(login.auth0Client).toBe(
      "eyJuYW1lIjoiYXV0aDAtc3BhLWpzIiwidmVyc2lvbiI6IjIuMS4zIn0=",
    );

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
        login_id: loginSession.id,
        expires_at: expect.any(String),
        code_challenge: "codeChallenge",
        code_challenge_method: CodeChallengeMethod.S256,
        state: "state",
        nonce: "nonce",
        redirect_uri: "https://example.com/callback",
      });
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
});
