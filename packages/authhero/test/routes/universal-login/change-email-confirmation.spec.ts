import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";

describe("change-email-confirmation", () => {
  it("should redirect to account page when no screen_hint was used", async () => {
    const { universalApp, env } = await getTestServer();
    const universalClient = testClient(universalApp, env);

    // Create test user
    await env.data.users.create("tenantId", {
      user_id: "email|testuser",
      email: "test@example.com",
      email_verified: true,
      name: "Test User",
      nickname: "Test User",
      connection: "email",
      provider: "email",
      is_social: false,
    });

    // Create login session without screen_hint
    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrf",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
      },
      authorization_url:
        "https://test.example.com/account?client_id=clientId&redirect_url=https://example.com/callback",
    });

    // Create active session
    await env.data.sessions.create("tenantId", {
      id: "test-session",
      user_id: "email|testuser",
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

    // Access change-email-confirmation page
    const response = await universalClient["change-email-confirmation"].$get(
      {
        query: {
          state: loginSession.id,
          email: "newemail@example.com",
        },
      },
      {
        headers: {
          cookie: "tenantId-auth-token=test-session",
        },
      },
    );

    expect(response.status).toBe(200);
    const content = await response.text();

    // Should contain link back to account page
    expect(content).toContain(
      `/u/account?state=${encodeURIComponent(loginSession.id)}`,
    );
    // Should not contain the original redirect_uri
    expect(content).not.toContain("https://example.com/callback");
  });

  it("should redirect to original redirect_uri when screen_hint=change-email was used", async () => {
    const { universalApp, env } = await getTestServer();
    const universalClient = testClient(universalApp, env);

    // Create test user
    await env.data.users.create("tenantId", {
      user_id: "email|testuser2",
      email: "test2@example.com",
      email_verified: true,
      name: "Test User 2",
      nickname: "Test User 2",
      connection: "email",
      provider: "email",
      is_social: false,
    });

    // Create login session WITH screen_hint=change-email
    const loginSession2 = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrf",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://myapp.example.com/dashboard",
      },
      authorization_url:
        "https://test.example.com/account?client_id=clientId&redirect_url=https://myapp.example.com/dashboard&screen_hint=change-email",
    });

    // Create active session
    await env.data.sessions.create("tenantId", {
      id: "test-session2",
      user_id: "email|testuser2",
      clients: ["clientId"],
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      used_at: new Date().toISOString(),
      login_session_id: loginSession2.id,
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
    });

    // Access change-email-confirmation page
    const response = await universalClient["change-email-confirmation"].$get(
      {
        query: {
          state: loginSession2.id,
          email: "newemail2@example.com",
        },
      },
      {
        headers: {
          cookie: "tenantId-auth-token=test-session2",
        },
      },
    );

    expect(response.status).toBe(200);
    const content = await response.text();

    // Should contain link to original redirect_uri instead of account page
    expect(content).toContain("https://myapp.example.com/dashboard");
    // Should not contain account page link
    expect(content).not.toContain("/u/account");
  });

  it("should return 400 when login session doesn't exist", async () => {
    const { universalApp, env } = await getTestServer();
    const universalClient = testClient(universalApp, env);

    // Create test user
    await env.data.users.create("tenantId", {
      user_id: "email|testuser3",
      email: "test3@example.com",
      email_verified: true,
      name: "Test User 3",
      nickname: "Test User 3",
      connection: "email",
      provider: "email",
      is_social: false,
    });

    // Create a login session
    const loginSession3 = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrf",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
      },
      authorization_url:
        "https://test.example.com/account?client_id=clientId&redirect_url=https://example.com/callback",
    });

    // Create active session
    await env.data.sessions.create("tenantId", {
      id: "test-session3",
      user_id: "email|testuser3",
      clients: ["clientId"],
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      used_at: new Date().toISOString(),
      login_session_id: loginSession3.id,
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
    });

    // Access change-email-confirmation page with non-existent state
    const response = await universalClient["change-email-confirmation"].$get(
      {
        query: {
          state: "non-existent-state", // This state doesn't exist
          email: "newemail3@example.com",
        },
      },
      {
        headers: {
          cookie: "tenantId-auth-token=test-session3",
        },
      },
    );

    // Should return 400 because the login session doesn't exist
    expect(response.status).toBe(400);
  });
});
