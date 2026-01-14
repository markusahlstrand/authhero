import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { createSessions } from "../../helpers/create-session";
import { LoginSessionState } from "@authhero/adapter-interfaces";

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

  it("should NOT complete continuation when accessing confirmation page - let /u/continue handle it", async () => {
    const { universalApp, env } = await getTestServer();
    const universalClient = testClient(universalApp, env);

    // Create sessions using helper
    const { loginSession, session } = await createSessions(env.data);

    // Set up the login session in AWAITING_CONTINUATION state (simulating mid-login form redirect)
    const continuationReturnUrl = `/u/continue?state=${encodeURIComponent(loginSession.id)}`;
    await env.data.loginSessions.update("tenantId", loginSession.id, {
      state: LoginSessionState.AWAITING_CONTINUATION,
      state_data: JSON.stringify({
        continuationScope: ["change-email"],
        continuationReturnUrl,
      }),
      user_id: "email|userId",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
      },
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

    // Should contain link to /u/continue (the continuation return URL)
    expect(content).toContain(continuationReturnUrl);

    // Verify the login session state is STILL in AWAITING_CONTINUATION
    // This is the key fix - previously it would transition to AUTHENTICATED here
    const loginSessionAfter = await env.data.loginSessions.get(
      "tenantId",
      loginSession.id,
    );
    expect(loginSessionAfter?.state).toBe(LoginSessionState.AWAITING_CONTINUATION);

    // Verify state_data is preserved (not cleared)
    expect(loginSessionAfter?.state_data).toBeTruthy();
    const stateData = JSON.parse(loginSessionAfter!.state_data!);
    expect(stateData.continuationScope).toEqual(["change-email"]);
    expect(stateData.continuationReturnUrl).toBe(continuationReturnUrl);
  });

  it("should allow /u/continue to complete the flow after confirmation page", async () => {
    const { universalApp, env } = await getTestServer();
    const universalClient = testClient(universalApp, env);

    // Create sessions using helper
    const { loginSession, session } = await createSessions(env.data);

    // Set up the login session in AWAITING_CONTINUATION state
    const continuationReturnUrl = `/u/continue?state=${encodeURIComponent(loginSession.id)}`;
    await env.data.loginSessions.update("tenantId", loginSession.id, {
      state: LoginSessionState.AWAITING_CONTINUATION,
      state_data: JSON.stringify({
        continuationScope: ["change-email"],
        continuationReturnUrl,
      }),
      user_id: "email|userId",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        response_type: "code",
        scope: "openid",
      },
    });

    // First access the confirmation page
    const confirmResponse = await universalClient.account[
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
    expect(confirmResponse.status).toBe(200);

    // Verify state is still AWAITING_CONTINUATION
    const loginSessionMid = await env.data.loginSessions.get(
      "tenantId",
      loginSession.id,
    );
    expect(loginSessionMid?.state).toBe(LoginSessionState.AWAITING_CONTINUATION);

    // Now call /u/continue - this should work because state is still AWAITING_CONTINUATION
    const continueResponse = await universalClient.continue.$get({
      query: { state: loginSession.id },
    });

    // Should redirect to the client's redirect_uri with auth code
    expect(continueResponse.status).toBe(302);
    const location = continueResponse.headers.get("location");
    expect(location).toContain("https://example.com/callback");
    expect(location).toContain("code=");

    // Verify the login session state has been updated to completed
    const loginSessionAfter = await env.data.loginSessions.get(
      "tenantId",
      loginSession.id,
    );
    expect(loginSessionAfter?.state).toBe(LoginSessionState.COMPLETED);
  });
});
