import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { createSessions } from "../../helpers/create-session";

describe("change-email-confirmation", () => {
  it("should redirect to account page when no screen_hint was used", async () => {
    const { universalApp, env } = await getTestServer();
    const universalClient = testClient(universalApp, env);

    // Create sessions using helper
    const { loginSession, session } = await createSessions(env.data);

    // Update login session with specific auth params
    await env.data.loginSessions.update("tenantId", loginSession.id, {
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
      },
      authorization_url:
        "https://test.example.com/account?client_id=clientId&redirect_url=https://example.com/callback",
    });

    // Access change-email-confirmation page
    const response = await universalClient.account[
      "change-email-confirmation"
    ].$get(
      {
        query: {
          state: loginSession.id,
          email: "newemail@example.com",
        },
      },
      {
        headers: {
          cookie: `tenantId-auth-token=${session.id}`,
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

    // Create sessions using helper
    const { loginSession, session } = await createSessions(env.data);

    // Update login session with specific auth params including screen_hint
    await env.data.loginSessions.update("tenantId", loginSession.id, {
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://myapp.example.com/dashboard",
      },
      authorization_url:
        "https://test.example.com/account?client_id=clientId&redirect_url=https://myapp.example.com/dashboard&screen_hint=change-email",
    });

    // Access change-email-confirmation page
    const response = await universalClient.account[
      "change-email-confirmation"
    ].$get(
      {
        query: {
          state: loginSession.id,
          email: "newemail2@example.com",
        },
      },
      {
        headers: {
          cookie: `tenantId-auth-token=${session.id}`,
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

    // Create session using helper (without login session for this test)
    const { session } = await createSessions(env.data);

    // Access change-email-confirmation page with non-existent state
    const response = await universalClient.account[
      "change-email-confirmation"
    ].$get(
      {
        query: {
          state: "non-existent-state",
          email: "newemail3@example.com",
        },
      },
      {
        headers: {
          cookie: `tenantId-auth-token=${session.id}`,
        },
      },
    );

    // Should return 400 because the login session doesn't exist
    expect(response.status).toBe(400);
  });
});
