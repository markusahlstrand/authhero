import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";

describe("account", () => {
  it("should create a login session and redirect to login when no session exists", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const response = await oauthClient.account.$get({
      query: {
        client_id: "clientId",
        redirect_url: "https://example.com/callback",
      },
    });

    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    expect(location).toContain("/u/login/identifier?state=");

    // Extract state and verify login session was created
    const url = new URL(location!, "http://localhost:3000");
    const state = url.searchParams.get("state");
    expect(state).toBeDefined();

    const loginSession = await env.data.loginSessions.get("clientId", state!);
    expect(loginSession).toBeDefined();
    expect(loginSession?.authParams.client_id).toBe("clientId");
    expect(loginSession?.authParams.redirect_uri).toBe(
      "https://example.com/callback",
    );
  });

  it("should use current URL as redirect_uri when no redirect_url provided", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const response = await oauthClient.account.$get({
      query: {
        client_id: "clientId",
      },
    });

    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    const url = new URL(location!, "http://localhost:3000");
    const state = url.searchParams.get("state");

    const loginSession = await env.data.loginSessions.get("clientId", state!);
    expect(loginSession?.authParams.redirect_uri).toContain("/account");
  });

  it("should include login_hint in authParams when provided", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const response = await oauthClient.account.$get({
      query: {
        client_id: "clientId",
        redirect_url: "https://example.com/callback",
        login_hint: "test@example.com",
      },
    });

    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    const url = new URL(location!, "http://localhost:3000");
    const state = url.searchParams.get("state");

    const loginSession = await env.data.loginSessions.get("clientId", state!);
    expect(loginSession?.authParams.username).toBe("test@example.com");
  });

  it("should return 403 for invalid client_id", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const response = await oauthClient.account.$get({
      query: {
        client_id: "invalid-client-id",
        redirect_url: "https://example.com/account",
      },
    });

    expect(response.status).toEqual(403);
  });

  it("should redirect to /u/account when valid session exists", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Create test user
    await env.data.users.create("tenantId", {
      user_id: "email|test",
      email: "test@example.com",
      email_verified: true,
      name: "Test User",
      nickname: "Test User",
      connection: "email",
      provider: "email",
      is_social: false,
    });

    // Create login session (required for session)
    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrf",
      authParams: { client_id: "clientId" },
    });

    // Create active session
    await env.data.sessions.create("tenantId", {
      id: "test-session",
      user_id: "email|test",
      clients: ["clientId"],
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
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
    });

    const response = await oauthClient.account.$get(
      {
        query: {
          client_id: "clientId",
          redirect_url: "https://example.com/callback",
        },
      },
      {
        headers: { cookie: "tenantId-auth-token=test-session" },
      },
    );

    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    expect(location).toContain("/u/account?state=");
  });

  it("should redirect to login when session is revoked", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Create test user
    await env.data.users.create("tenantId", {
      user_id: "email|revoked",
      email: "revoked@example.com",
      email_verified: true,
      name: "Revoked User",
      nickname: "Revoked User",
      connection: "email",
      provider: "email",
      is_social: false,
    });

    // Create login session (required for session)
    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrf",
      authParams: { client_id: "clientId" },
    });

    // Create revoked session
    await env.data.sessions.create("tenantId", {
      id: "revoked-session",
      user_id: "email|revoked",
      clients: ["clientId"],
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      used_at: new Date().toISOString(),
      revoked_at: new Date().toISOString(), // Revoked
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

    const response = await oauthClient.account.$get(
      {
        query: {
          client_id: "clientId",
          redirect_url: "https://example.com/callback",
        },
      },
      {
        headers: { cookie: "tenantId-auth-token=revoked-session" },
      },
    );

    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    expect(location).toContain("/u/login/identifier?state=");
  });

  it("should redirect to /u/account/change-email with screen_hint when provided", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Create test user
    await env.data.users.create("tenantId", {
      user_id: "email|screenHintTest",
      email: "screenhint@example.com",
      email_verified: true,
      name: "Screen Hint Test User",
      nickname: "Screen Hint Test User",
      connection: "email",
      provider: "email",
      is_social: false,
    });

    // Create login session (required for session)
    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrf",
      authParams: { client_id: "clientId" },
    });

    // Create a session first
    const session = await env.data.sessions.create("tenantId", {
      id: "sessionId",
      user_id: "email|screenHintTest",
      clients: ["clientId"],
      expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
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
    });

    const response = await oauthClient.account.$get(
      {
        query: {
          client_id: "clientId",
          screen_hint: "change-email",
        },
      },
      {
        headers: { cookie: "tenantId-auth-token=sessionId" },
      },
    );

    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    expect(location).toContain("/u/account/change-email?state=");
  });

  it("should default to 'account' screen_hint when not provided", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Create test user
    await env.data.users.create("tenantId", {
      user_id: "email|defaultScreenHintTest",
      email: "defaulthint@example.com",
      email_verified: true,
      name: "Default Screen Hint Test User",
      nickname: "Default Screen Hint Test User",
      connection: "email",
      provider: "email",
      is_social: false,
    });

    // Create login session (required for session)
    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrf",
      authParams: { client_id: "clientId" },
    });

    // Create a session first
    const session = await env.data.sessions.create("tenantId", {
      id: "sessionId2",
      user_id: "email|defaultScreenHintTest",
      clients: ["clientId"],
      expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
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
    });

    const response = await oauthClient.account.$get(
      {
        query: {
          client_id: "clientId",
        },
      },
      {
        headers: { cookie: "tenantId-auth-token=sessionId2" },
      },
    );

    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    expect(location).toContain("/u/account?state=");
    // Should not contain screen_hint since default "account" redirects to regular account page
    expect(location).not.toContain("screen_hint=");
  });
});
