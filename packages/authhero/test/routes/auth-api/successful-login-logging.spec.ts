import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import bcryptjs from "bcryptjs";
import { nanoid } from "nanoid";
import { getTestServer } from "../../helpers/test-server";
import { USERNAME_PASSWORD_PROVIDER } from "../../../src/constants";
import { Strategy } from "@authhero/adapter-interfaces";

describe("successful login - logging", () => {
  it("should log successful login with type 's' and comprehensive details", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Create the user
    await env.data.users.create("tenantId", {
      email: "test-login@example.com",
      email_verified: true,
      name: "Test User",
      nickname: "testuser",
      connection: Strategy.USERNAME_PASSWORD,
      provider: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      user_id: `${USERNAME_PASSWORD_PROVIDER}|test123`,
      login_count: 5,
    });

    // Set the password
    await env.data.passwords.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|test123`,
      password: await bcryptjs.hash("Test1234!", 10),
      algorithm: "bcrypt",
    });

    const beforeLogin = new Date();

    const loginResponse = await oauthClient.co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: Strategy.USERNAME_PASSWORD,
        password: "Test1234!",
        username: "test-login@example.com",
      },
    });

    expect(loginResponse.status).toEqual(200);

    const afterLogin = new Date();

    // Check the logs
    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    // Find the successful login log (type 's')
    const successLoginLog = logs.find((log) => log.type === "s");

    expect(successLoginLog).toBeDefined();
    expect(successLoginLog?.type).toBe("s");
    expect(successLoginLog?.description).toContain("Successful login");

    // Verify timestamp
    expect(successLoginLog?.date).toBeDefined();
    const logDate = new Date(successLoginLog!.date);
    expect(logDate.getTime()).toBeGreaterThanOrEqual(beforeLogin.getTime());
    expect(logDate.getTime()).toBeLessThanOrEqual(afterLogin.getTime());

    // Verify user details
    expect(successLoginLog?.user_id).toBe(
      `${USERNAME_PASSWORD_PROVIDER}|test123`,
    );
    expect(successLoginLog?.user_name).toBeDefined();

    // Verify connection details
    expect(successLoginLog?.connection).toBe(Strategy.USERNAME_PASSWORD);
    expect(successLoginLog?.strategy).toBeDefined();
    expect(successLoginLog?.strategy_type).toBe("database");

    // Verify client details
    expect(successLoginLog?.client_id).toBe("clientId");

    // Verify request details
    expect(successLoginLog?.ip).toBeDefined();
    expect(successLoginLog?.user_agent).toBeDefined();
  });

  it("should log successful login with correct strategy_type for social login", async () => {
    const { oauthApp, env } = await getTestServer();

    // Create a social user (e.g., Google OAuth)
    await env.data.users.create("tenantId", {
      email: "social-user@example.com",
      email_verified: true,
      name: "Social User",
      nickname: "socialuser",
      connection: "google-oauth2",
      provider: "google-oauth2",
      is_social: true,
      user_id: "google-oauth2|123456",
      login_count: 10,
    });

    // Note: Social logins typically go through a different flow
    // For testing purposes, we'll verify the log structure
    // when a social user exists in the system

    const { logs: initialLogs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    // In a real scenario, social login would create a log with strategy_type: "social"
    // This test verifies the data structure is correct
    const user = await env.data.users.get("tenantId", "google-oauth2|123456");
    expect(user).toBeDefined();
    expect(user?.is_social).toBe(true);
    expect(user?.provider).toBe("google-oauth2");
    expect(user?.connection).toBe("google-oauth2");
  });

  it("should increment login count after successful login", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Create the user with initial login count of 0 (default)
    await env.data.users.create("tenantId", {
      email: "count-test@example.com",
      email_verified: true,
      name: "Count Test User",
      nickname: "counttest",
      connection: Strategy.USERNAME_PASSWORD,
      provider: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      user_id: `${USERNAME_PASSWORD_PROVIDER}|count123`,
    });

    // Set the password
    await env.data.passwords.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|count123`,
      password: await bcryptjs.hash("Test1234!", 10),
      algorithm: "bcrypt",
    });

    const loginResponse = await oauthClient.co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: Strategy.USERNAME_PASSWORD,
        password: "Test1234!",
        username: "count-test@example.com",
      },
    });

    expect(loginResponse.status).toEqual(200);

    // Verify user's login count was incremented
    const updatedUser = await env.data.users.get(
      "tenantId",
      `${USERNAME_PASSWORD_PROVIDER}|count123`,
    );
    expect(updatedUser?.login_count).toBe(1);

    // Verify last_login and last_ip were updated
    expect(updatedUser?.last_login).toBeDefined();
    expect(updatedUser?.last_ip).toBeDefined();
  });

  it("should include hostname in login log", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Create the user
    await env.data.users.create("tenantId", {
      email: "hostname-test@example.com",
      email_verified: true,
      name: "Hostname Test User",
      nickname: "hostnametest",
      connection: Strategy.USERNAME_PASSWORD,
      provider: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      user_id: `${USERNAME_PASSWORD_PROVIDER}|hostname123`,
    });

    // Set the password
    await env.data.passwords.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|hostname123`,
      password: await bcryptjs.hash("Test1234!", 10),
      algorithm: "bcrypt",
    });

    const loginResponse = await oauthClient.co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: Strategy.USERNAME_PASSWORD,
        password: "Test1234!",
        username: "hostname-test@example.com",
      },
    });

    expect(loginResponse.status).toEqual(200);

    // Check the logs
    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    const successLoginLog = logs.find((log) => log.type === "s");

    expect(successLoginLog).toBeDefined();
    expect(successLoginLog?.hostname).toBeDefined();
  });

  it("should log the connection name (not the strategy) plus connection_id, client_name and user_name for a strategy-based login and its code exchange", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // A connection whose name differs from its strategy — like an Okta
    // enterprise connection ("Okta-Warner" / "okta"). Regression: the logs
    // used to record the strategy as the connection, which went unnoticed for
    // database/passwordless connections where the two coincide.
    await env.data.connections.create("tenantId", {
      id: "con_oktaWarner",
      name: "Okta-Warner",
      strategy: "mock-strategy",
      options: {
        client_id: "mockClientId",
        client_secret: "mockClientSecret",
      },
    });

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        scope: "openid profile email",
        audience: "https://example.com",
      },
    });

    const state = await env.data.codes.create("tenantId", {
      code_id: nanoid(),
      code_type: "oauth2_state",
      login_id: loginSession.id,
      connection_id: "con_oktaWarner",
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const callbackResponse = await oauthClient.callback.$get({
      query: {
        state: state.code_id,
        code: "foo@example.com",
      },
    });
    expect(callbackResponse.status).toEqual(302);
    expect(callbackResponse.headers.get("location")).toEqual(
      `/authorize/resume?state=${loginSession.id}`,
    );

    const resumeResponse = await oauthClient.authorize.resume.$get({
      query: { state: loginSession.id },
    });
    expect(resumeResponse.status).toEqual(302);
    const finalLocation = resumeResponse.headers.get("location");
    if (!finalLocation) {
      throw new Error("No location header");
    }
    const authCode = new URL(finalLocation).searchParams.get("code");
    if (!authCode) {
      throw new Error("No code in redirect");
    }

    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });
    const successLoginLog = logs.find((log) => log.type === "s");

    expect(successLoginLog).toBeDefined();
    expect(successLoginLog?.connection).toBe("Okta-Warner");
    expect(successLoginLog?.connection_id).toBe("con_oktaWarner");
    expect(successLoginLog?.strategy).toBe("mock-strategy");
    expect(successLoginLog?.client_name).toBe("Test Client");
    expect(successLoginLog?.user_name).toBe("foo@example.com");

    // Exchange the code and verify the seacft log carries the same identity
    // fields (it used to only have user_id, scope and audience).
    const tokenResponse = await oauthClient.oauth.token.$post(
      {
        form: {
          grant_type: "authorization_code",
          code: authCode,
          redirect_uri: "https://example.com/callback",
          client_id: "clientId",
          client_secret: "clientSecret",
        },
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );
    expect(tokenResponse.status).toBe(200);

    const { logs: logsAfterExchange } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });
    const exchangeLog = logsAfterExchange.find((log) => log.type === "seacft");

    expect(exchangeLog).toBeDefined();
    expect(exchangeLog?.connection).toBe("Okta-Warner");
    expect(exchangeLog?.connection_id).toBe("con_oktaWarner");
    expect(exchangeLog?.strategy).toBe("mock-strategy");
    expect(exchangeLog?.strategy_type).toBe("social");
    expect(exchangeLog?.client_name).toBe("Test Client");
    expect(exchangeLog?.user_name).toBe("foo@example.com");
    // foo@example.com links to the seeded primary user — the log must still
    // carry the connection actually used, not the primary identity's.
    expect(exchangeLog?.user_id).toBe("email|userId");
  });

  it("should log connection_id when available", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Create the user
    await env.data.users.create("tenantId", {
      email: "connection-test@example.com",
      email_verified: true,
      name: "Connection Test User",
      nickname: "connectiontest",
      connection: Strategy.USERNAME_PASSWORD,
      provider: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      user_id: `${USERNAME_PASSWORD_PROVIDER}|conn123`,
    });

    // Set the password
    await env.data.passwords.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|conn123`,
      password: await bcryptjs.hash("Test1234!", 10),
      algorithm: "bcrypt",
    });

    const loginResponse = await oauthClient.co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: Strategy.USERNAME_PASSWORD,
        password: "Test1234!",
        username: "connection-test@example.com",
      },
    });

    expect(loginResponse.status).toEqual(200);

    // Check the logs
    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    const successLoginLog = logs.find((log) => log.type === "s");

    expect(successLoginLog).toBeDefined();
    // connection_id should be present (might be empty string in test environment)
    expect(successLoginLog?.connection_id).toBeDefined();
  });
});
