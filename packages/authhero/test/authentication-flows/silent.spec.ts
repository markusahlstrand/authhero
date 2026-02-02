import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { testClient } from "hono/testing";
import {
  AuthorizationResponseMode,
  AuthorizationResponseType,
  LogTypes,
} from "@authhero/adapter-interfaces";

describe("silent", () => {
  it("should return a auth response for a valid silent auth session", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
      },
    });

    const session = await env.data.sessions.create("tenantId", {
      id: "sessionId",
      user_id: "email|userId",
      used_at: new Date().toISOString(),
      login_session_id: loginSession.id, // Link session to login session
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      clients: ["clientId"],
    });

    // ----------------------------------------
    // Get a token and id-token for the session
    // ----------------------------------------
    const accessTokenResponse = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "state",
          prompt: "none",
          response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
          response_mode: AuthorizationResponseMode.WEB_MESSAGE,
        },
      },
      {
        headers: {
          origin: "https://example.com",
          cookie: `tenantId-auth-token=${session.id}`,
        },
      },
    );

    expect(accessTokenResponse.status).toEqual(200);
    const accessTokenhtmlBody = await accessTokenResponse.text();
    expect(accessTokenhtmlBody).toContain("access_token");

    // ----------------------------------------
    // Get a code for the session
    // ----------------------------------------
    const codeResponse = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "state",
          prompt: "none",
          response_type: AuthorizationResponseType.CODE,
          response_mode: AuthorizationResponseMode.WEB_MESSAGE,
          code_challenge: "ZLQ3m0EnuZ-kdlU1aRGNOPN_dTW8ewOVqEEfZd0cFZE",
        },
      },
      {
        headers: {
          origin: "https://example.com",
          cookie: `tenantId-auth-token=${session.id}`,
        },
      },
    );

    expect(codeResponse.status).toEqual(200);
    const codeResponseHtmlBody = await codeResponse.text();
    expect(codeResponseHtmlBody).toContain("code");

    const codeMatch = codeResponseHtmlBody.match(/"code":"([^"]+)"/);

    const code = await env.data.codes.get(
      "tenantId",
      codeMatch?.[1] || "",
      "authorization_code",
    );
    expect(code).toBeDefined();
    // The code should now be linked to a NEW login session created during silent auth
    expect(code?.login_id).not.toEqual(loginSession.id);
    expect(code?.code_challenge).toEqual(
      "ZLQ3m0EnuZ-kdlU1aRGNOPN_dTW8ewOVqEEfZd0cFZE",
    );

    // Verify the new login session was created and linked to the current session
    const newLoginSession = await env.data.loginSessions.get(
      "tenantId",
      code?.login_id || "",
    );
    expect(newLoginSession).toBeDefined();
    expect(newLoginSession?.session_id).toEqual(session.id);
    expect(newLoginSession?.authParams.client_id).toEqual("clientId");

    // Check that the session was updated
    const updatedSession = await env.data.sessions.get("tenantId", "sessionId");
    if (!updatedSession) {
      throw new Error("Session not found");
    }

    expect(updatedSession.used_at).not.toEqual(session.used_at);
    // The session should now be linked to the new login session
    expect(updatedSession.login_session_id).toEqual(code?.login_id);
  });

  it("should clear session cookie when silent auth fails with expired session", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
      },
    });

    // Create an expired session
    const session = await env.data.sessions.create("tenantId", {
      id: "sessionId",
      user_id: "email|userId",
      used_at: new Date().toISOString(),
      login_session_id: loginSession.id,
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
      expires_at: new Date(Date.now() - 1000).toISOString(), // Expired
      clients: ["clientId"],
    });

    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "state",
          prompt: "none",
          response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
          response_mode: AuthorizationResponseMode.WEB_MESSAGE,
        },
      },
      {
        headers: {
          origin: "https://example.com",
          cookie: `tenantId-auth-token=${session.id}`,
        },
      },
    );

    expect(response.status).toEqual(200);
    const body = await response.text();
    expect(body).toContain("login_required");

    // Verify that set-cookie header is present to clear the cookie
    const setCookieHeader = response.headers.get("set-cookie");
    expect(setCookieHeader).toBeTruthy();
    expect(setCookieHeader).toContain("tenantId-auth-token=");
    expect(setCookieHeader).toContain("Max-Age=0");

    // Verify that a FAILED_SILENT_AUTH log was created
    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 10,
      include_totals: true,
    });
    const failedLog = logs.find(
      (log) => log.type === LogTypes.FAILED_SILENT_AUTH,
    );
    expect(failedLog).toBeDefined();
  });

  it("should not log FAILED_SILENT_AUTH when called without session cookie", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Get current log count
    const logsBefore = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: true,
    });
    const failedLogsBefore = logsBefore.logs.filter(
      (log) => log.type === LogTypes.FAILED_SILENT_AUTH,
    );

    // Call silent auth without any session cookie
    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "state",
          prompt: "none",
          response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
          response_mode: AuthorizationResponseMode.WEB_MESSAGE,
        },
      },
      {
        headers: {
          origin: "https://example.com",
          // No cookie header
        },
      },
    );

    expect(response.status).toEqual(200);
    const body = await response.text();
    expect(body).toContain("login_required");

    // Verify that NO set-cookie header is sent when there was no session
    const setCookieHeader = response.headers.get("set-cookie");
    expect(setCookieHeader).toBeNull();

    // Verify that NO new FAILED_SILENT_AUTH log was created
    const logsAfter = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: true,
    });
    const failedLogsAfter = logsAfter.logs.filter(
      (log) => log.type === LogTypes.FAILED_SILENT_AUTH,
    );
    expect(failedLogsAfter.length).toEqual(failedLogsBefore.length);
  });

  it("should redirect with login_required error when prompt=none without session (no response_mode)", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Call silent auth without any session cookie and without response_mode
    // This should redirect back with error (OIDC conformance behavior)
    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "test-state",
          prompt: "none",
          response_type: AuthorizationResponseType.CODE,
        },
      },
      {
        headers: {
          origin: "https://example.com",
          // No cookie header
        },
      },
    );

    // Should get a 302 redirect
    expect(response.status).toEqual(302);

    // Check the Location header contains the error
    const locationHeader = response.headers.get("location");
    expect(locationHeader).toBeTruthy();

    const redirectUrl = new URL(locationHeader!);
    expect(redirectUrl.origin).toEqual("https://example.com");
    expect(redirectUrl.pathname).toEqual("/callback");
    expect(redirectUrl.searchParams.get("error")).toEqual("login_required");
    expect(redirectUrl.searchParams.get("error_description")).toEqual(
      "Login required",
    );
    expect(redirectUrl.searchParams.get("state")).toEqual("test-state");
  });

  it("should redirect with token in fragment when prompt=none with valid session (no response_mode, token response)", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
      },
    });

    const session = await env.data.sessions.create("tenantId", {
      id: "sessionId",
      user_id: "email|userId",
      used_at: new Date().toISOString(),
      login_session_id: loginSession.id,
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      clients: ["clientId"],
    });

    // Call silent auth with valid session but without response_mode
    // This should redirect back with tokens in the fragment
    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "test-state",
          prompt: "none",
          response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
        },
      },
      {
        headers: {
          origin: "https://example.com",
          cookie: `tenantId-auth-token=${session.id}`,
        },
      },
    );

    // Should get a 302 redirect
    expect(response.status).toEqual(302);

    // Check the Location header contains the tokens in the fragment
    const locationHeader = response.headers.get("location");
    expect(locationHeader).toBeTruthy();

    const redirectUrl = new URL(locationHeader!);
    expect(redirectUrl.origin).toEqual("https://example.com");
    expect(redirectUrl.pathname).toEqual("/callback");

    // Parse the fragment
    const fragmentParams = new URLSearchParams(redirectUrl.hash.slice(1));
    expect(fragmentParams.get("access_token")).toBeTruthy();
    expect(fragmentParams.get("state")).toEqual("test-state");
  });

  it("should return access token with org_id for organization-scoped silent auth", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Create an organization
    const organization = await env.data.organizations.create("tenantId", {
      id: "org_test123",
      name: "Test Organization",
    });

    // Add user to organization
    await env.data.userOrganizations.create("tenantId", {
      user_id: "email|userId",
      organization_id: organization.id,
    });

    const session = await env.data.sessions.create("tenantId", {
      id: "sessionId",
      user_id: "email|userId",
      used_at: new Date().toISOString(),
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      clients: ["clientId"],
    });

    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "test-state",
          prompt: "none",
          response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
          response_mode: AuthorizationResponseMode.WEB_MESSAGE,
          organization: organization.id,
        },
      },
      {
        headers: {
          origin: "https://example.com",
          cookie: `tenantId-auth-token=${session.id}`,
        },
      },
    );

    expect(response.status).toEqual(200);
    const htmlBody = await response.text();
    expect(htmlBody).toContain("access_token");

    // Extract the access token from the response
    const accessTokenMatch = htmlBody.match(/"access_token":"([^"]+)"/);
    expect(accessTokenMatch).toBeTruthy();

    // Decode the access token (JWT) to verify it contains org_id
    const accessToken = accessTokenMatch![1];
    const [, payloadBase64] = accessToken.split(".");
    const payload = JSON.parse(atob(payloadBase64));

    expect(payload.org_id).toEqual(organization.id);
  });

  it("should return login_required error when user is not a member of organization", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Create an organization but DO NOT add user to it
    const organization = await env.data.organizations.create("tenantId", {
      id: "org_notmember",
      name: "Other Organization",
    });

    const session = await env.data.sessions.create("tenantId", {
      id: "sessionId",
      user_id: "email|userId",
      used_at: new Date().toISOString(),
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      clients: ["clientId"],
    });

    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "test-state",
          prompt: "none",
          response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
          response_mode: AuthorizationResponseMode.WEB_MESSAGE,
          organization: organization.id,
        },
      },
      {
        headers: {
          origin: "https://example.com",
          cookie: `tenantId-auth-token=${session.id}`,
        },
      },
    );

    expect(response.status).toEqual(200);
    const htmlBody = await response.text();
    expect(htmlBody).toContain("login_required");
    expect(htmlBody).toContain("User is not a member of the specified organization");
  });
});
