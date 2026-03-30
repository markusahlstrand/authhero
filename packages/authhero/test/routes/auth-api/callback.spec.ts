import { describe, it, expect, vi } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { nanoid } from "nanoid";
import {
  AuthorizationResponseMode,
  LoginSessionState,
  Strategy,
} from "@authhero/adapter-interfaces";

describe("callback", () => {
  it("should redirect to /u/error if the state isn't found", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const response = await oauthClient.callback.$get({
      query: {
        state: "invalid",
        code: "code",
      },
    });

    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    if (!location) {
      throw new Error("No location header");
    }
    const redirectUri = new URL(location);
    expect(redirectUri.pathname).toEqual("/u/error");
    expect(redirectUri.searchParams.get("error")).toEqual("state_not_found");
  });

  it("should redirect to identifier page with error when signup is disabled for new social login user (web_message response_mode)", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Update the client to disable signups
    await env.data.clients.update("tenantId", "clientId", {
      client_metadata: {
        disable_sign_ups: "true",
      },
    });

    // Create a connection to test against
    await env.data.connections.create("tenantId", {
      id: "connectionId",
      name: "mock-strategy",
      strategy: "mock-strategy",
      options: {
        client_id: "clientId",
        client_secret: "clientSecret",
      },
    });

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        response_mode: AuthorizationResponseMode.WEB_MESSAGE,
      },
    });

    const state = await env.data.codes.create("tenantId", {
      code_id: nanoid(),
      code_type: "oauth2_state",
      login_id: loginSession.id,
      connection_id: "connectionId",
      code_verifier: "verifier",
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    // Try to callback with a new user email (signup disabled should block this)
    const response = await oauthClient.callback.$get({
      query: {
        state: state.code_id,
        code: "newuser@example.com", // This email doesn't exist, so it would be a new signup
      },
    });

    // Should redirect to identifier page with error
    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    if (!location) {
      throw new Error("No location header");
    }
    const redirectUri = new URL(location);
    expect(redirectUri.pathname).toEqual("/u/login/identifier");
    expect(redirectUri.searchParams.get("error")).toEqual("access_denied");
    expect(redirectUri.searchParams.get("error_description")).toBeTruthy();
    expect(redirectUri.searchParams.get("state")).toEqual(loginSession.id);
  });

  it("should redirect to identifier page with error when signup is disabled for new social login user (query response_mode)", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Update the client to disable signups
    await env.data.clients.update("tenantId", "clientId", {
      client_metadata: {
        disable_sign_ups: "true",
      },
    });

    // Create a connection to test against
    await env.data.connections.create("tenantId", {
      id: "connectionId",
      name: "mock-strategy",
      strategy: "mock-strategy",
      options: {
        client_id: "clientId",
        client_secret: "clientSecret",
      },
    });

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        response_mode: AuthorizationResponseMode.QUERY,
      },
    });

    const state = await env.data.codes.create("tenantId", {
      code_id: nanoid(),
      code_type: "oauth2_state",
      login_id: loginSession.id,
      connection_id: "connectionId",
      code_verifier: "verifier",
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    // Try to callback with a new user email (signup disabled should block this)
    const response = await oauthClient.callback.$get({
      query: {
        state: state.code_id,
        code: "newuser@example.com", // This email doesn't exist, so it would be a new signup
      },
    });

    // Should redirect to identifier page with error (not return JSON)
    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    if (!location) {
      throw new Error("No location header");
    }
    const redirectUri = new URL(location);
    expect(redirectUri.pathname).toEqual("/u/login/identifier");
    expect(redirectUri.searchParams.get("error")).toEqual("access_denied");
    expect(redirectUri.searchParams.get("error_description")).toBeTruthy();
    expect(redirectUri.searchParams.get("state")).toEqual(loginSession.id);
  });

  it("should return a 302 back to universal auth if there's an error", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
      },
    });

    const state = await env.data.codes.create("tenantId", {
      code_id: nanoid(),
      code_type: "oauth2_state",
      login_id: loginSession.id,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const response = await oauthClient.callback.$get({
      query: {
        state: state.code_id,
        error: "error",
        error_description: "error_description",
        error_code: "error_code",
      },
    });

    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    if (!location) {
      throw new Error("No location header");
    }
    const redirectUri = new URL(location);
    expect(redirectUri.pathname).toEqual("/u/login/identifier");
    expect(redirectUri.searchParams.get("error")).toEqual("error");
    expect(redirectUri.searchParams.get("state")).toEqual(loginSession.id);
  });

  it("should redirect to /u2/login/identifier with error params when universal_login_version is 2", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Set client to universal login v2
    await env.data.clients.update("tenantId", "clientId", {
      client_metadata: {
        universal_login_version: "2",
      },
    });

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
      },
    });

    const state = await env.data.codes.create("tenantId", {
      code_id: nanoid(),
      code_type: "oauth2_state",
      login_id: loginSession.id,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const response = await oauthClient.callback.$get({
      query: {
        state: state.code_id,
        error: "access_denied",
        error_description: "Signup disabled",
        error_code: "signup_disabled",
      },
    });

    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    if (!location) {
      throw new Error("No location header");
    }
    const redirectUri = new URL(location);
    expect(redirectUri.pathname).toEqual("/u2/login/identifier");
    expect(redirectUri.searchParams.get("error")).toEqual("access_denied");
    expect(redirectUri.searchParams.get("error_description")).toEqual(
      "Signup disabled",
    );
    expect(redirectUri.searchParams.get("state")).toEqual(loginSession.id);
  });

  it("should return a code response redirect for a connection user", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Create a connection to test against
    await env.data.connections.create("tenantId", {
      id: "connectionId",
      name: "mock-strategy",
      strategy: "mock-strategy",
      options: {
        client_id: "clientId",
        client_secret: "clientSecret",
      },
    });

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
      },
    });

    const state = await env.data.codes.create("tenantId", {
      code_id: nanoid(),
      code_type: "oauth2_state",
      login_id: loginSession.id,
      connection_id: "connectionId",
      code_verifier: "verifier",
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    // This will create a user that is merged with the default test user
    const response = await oauthClient.callback.$get({
      query: {
        state: state.code_id,
        code: "foo@example.com",
      },
    });

    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    if (!location) {
      throw new Error("No location header");
    }
    const redirectUri = new URL(location);
    expect(redirectUri.pathname).toEqual("/callback");

    const { logs } = await env.data.logs.list("tenantId");
    expect(logs).toHaveLength(1);

    const user = await env.data.users.get("tenantId", "email|userId");
    expect(user?.identities?.length).toBe(2);
  });

  it("should populate root attributes from social profile on user creation", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    await env.data.connections.create("tenantId", {
      id: "connectionId",
      name: "mock-strategy",
      strategy: "mock-strategy",
      options: {
        client_id: "clientId",
        client_secret: "clientSecret",
      },
    });

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
      },
    });

    const state = await env.data.codes.create("tenantId", {
      code_id: nanoid(),
      code_type: "oauth2_state",
      login_id: loginSession.id,
      connection_id: "connectionId",
      code_verifier: "verifier",
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const response = await oauthClient.callback.$get({
      query: {
        state: state.code_id,
        code: "vipps-user@example.com",
      },
    });

    expect(response.status).toEqual(302);

    const user = await env.data.users.get(
      "tenantId",
      "mock-strategy|vipps-456",
    );
    expect(user).toBeTruthy();
    expect(user!.given_name).toEqual("Test");
    expect(user!.family_name).toEqual("User");
    expect(user!.name).toEqual("Test User");
    expect(user!.phone_number).toEqual("+4712345678");
    expect(user!.phone_verified).toEqual(true);
    expect(user!.picture).toEqual("https://example.com/avatar.jpg");
    expect(user!.nickname).toEqual("testuser");
    expect(user!.email_verified).toEqual(true);
  });

  it("should update root attributes on each login by default", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    await env.data.connections.create("tenantId", {
      id: "connectionId",
      name: "mock-strategy",
      strategy: "mock-strategy",
      options: {
        client_id: "clientId",
        client_secret: "clientSecret",
      },
    });

    // First login - creates user
    const loginSession1 = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
      },
    });

    const state1 = await env.data.codes.create("tenantId", {
      code_id: nanoid(),
      code_type: "oauth2_state",
      login_id: loginSession1.id,
      connection_id: "connectionId",
      code_verifier: "verifier",
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    await oauthClient.callback.$get({
      query: {
        state: state1.code_id,
        code: "vipps-user@example.com",
      },
    });

    // Second login - updates user with different profile data
    const loginSession2 = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
      },
    });

    const state2 = await env.data.codes.create("tenantId", {
      code_id: nanoid(),
      code_type: "oauth2_state",
      login_id: loginSession2.id,
      connection_id: "connectionId",
      code_verifier: "verifier",
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    await oauthClient.callback.$get({
      query: {
        state: state2.code_id,
        code: "vipps-user-updated@example.com",
      },
    });

    const user = await env.data.users.get(
      "tenantId",
      "mock-strategy|vipps-456",
    );
    expect(user).toBeTruthy();
    expect(user!.given_name).toEqual("Updated");
    expect(user!.family_name).toEqual("Name");
    expect(user!.name).toEqual("Updated Name");
    expect(user!.phone_number).toEqual("+4799999999");
    expect(user!.picture).toEqual("https://example.com/new-avatar.jpg");
    expect(user!.nickname).toEqual("updateduser");
  });

  it("should not update root attributes on subsequent login when set_user_root_attributes is on_first_login", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    await env.data.connections.create("tenantId", {
      id: "connectionId",
      name: "mock-strategy",
      strategy: "mock-strategy",
      options: {
        client_id: "clientId",
        client_secret: "clientSecret",
        set_user_root_attributes: "on_first_login",
      },
    });

    // First login - creates user with profile data
    const loginSession1 = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
      },
    });

    const state1 = await env.data.codes.create("tenantId", {
      code_id: nanoid(),
      code_type: "oauth2_state",
      login_id: loginSession1.id,
      connection_id: "connectionId",
      code_verifier: "verifier",
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    await oauthClient.callback.$get({
      query: {
        state: state1.code_id,
        code: "vipps-user@example.com",
      },
    });

    // Verify first login populated attributes
    let user = await env.data.users.get("tenantId", "mock-strategy|vipps-456");
    expect(user!.given_name).toEqual("Test");

    // Second login - should NOT update attributes
    const loginSession2 = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
      },
    });

    const state2 = await env.data.codes.create("tenantId", {
      code_id: nanoid(),
      code_type: "oauth2_state",
      login_id: loginSession2.id,
      connection_id: "connectionId",
      code_verifier: "verifier",
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    await oauthClient.callback.$get({
      query: {
        state: state2.code_id,
        code: "vipps-user-updated@example.com",
      },
    });

    user = await env.data.users.get("tenantId", "mock-strategy|vipps-456");
    // Should still have original values
    expect(user!.given_name).toEqual("Test");
    expect(user!.family_name).toEqual("User");
    expect(user!.name).toEqual("Test User");
    expect(user!.phone_number).toEqual("+4712345678");
  });

  it("should not populate root attributes from profile when set_user_root_attributes is never_on_login", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    await env.data.connections.create("tenantId", {
      id: "connectionId",
      name: "mock-strategy",
      strategy: "mock-strategy",
      options: {
        client_id: "clientId",
        client_secret: "clientSecret",
        set_user_root_attributes: "never_on_login",
      },
    });

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
      },
    });

    const state = await env.data.codes.create("tenantId", {
      code_id: nanoid(),
      code_type: "oauth2_state",
      login_id: loginSession.id,
      connection_id: "connectionId",
      code_verifier: "verifier",
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const response = await oauthClient.callback.$get({
      query: {
        state: state.code_id,
        code: "vipps-user@example.com",
      },
    });

    expect(response.status).toEqual(302);

    const user = await env.data.users.get(
      "tenantId",
      "mock-strategy|vipps-456",
    );
    expect(user).toBeTruthy();
    // Root attributes should NOT be populated from profile
    expect(user!.given_name).toBeUndefined();
    expect(user!.family_name).toBeUndefined();
    expect(user!.phone_number).toBeUndefined();
    expect(user!.phone_verified).toBeUndefined();
    expect(user!.picture).toBeUndefined();
    expect(user!.nickname).toBeUndefined();
    // Name should fall back to username (email)
    expect(user!.name).toEqual("vipps-user@example.com");
    // email_verified defaults to true for social logins even with never_on_login
    expect(user!.email_verified).toEqual(true);
  });

  it("should link social user to primary via setLinkedTo in pre-user-registration hook", async () => {
    const { oauthApp, env } = await getTestServer({
      hooks: {
        onExecutePreUserRegistration: async (event, api) => {
          // Look up an existing primary user and link the new social user to it
          const primaryUser = await event.ctx.env.data.users.get(
            event.ctx.var.tenant_id!,
            "auth2|primary-user",
          );
          if (primaryUser) {
            api.user.setLinkedTo(primaryUser.user_id);
          }
        },
      },
    });
    const oauthClient = testClient(oauthApp, env);

    // Create a primary user directly in the database
    await env.data.users.create("tenantId", {
      user_id: "auth2|primary-user",
      email: "primary@example.com",
      email_verified: true,
      connection: Strategy.USERNAME_PASSWORD,
      provider: "auth2",
      is_social: false,
    });

    // Create a connection for social login
    await env.data.connections.create("tenantId", {
      id: "connectionId",
      name: "mock-strategy",
      strategy: "mock-strategy",
      options: {
        client_id: "clientId",
        client_secret: "clientSecret",
      },
    });

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
      },
    });

    const state = await env.data.codes.create("tenantId", {
      code_id: nanoid(),
      code_type: "oauth2_state",
      login_id: loginSession.id,
      connection_id: "connectionId",
      code_verifier: "verifier",
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    // Trigger social callback — mock strategy default returns sub:"123", email:"hello@example.com"
    const response = await oauthClient.callback.$get({
      query: {
        state: state.code_id,
        code: "code",
      },
    });

    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    expect(location).toBeTruthy();

    // The primary user should now have the social identity linked
    const primaryUser = await env.data.users.get(
      "tenantId",
      "auth2|primary-user",
    );
    expect(primaryUser).toBeTruthy();
    expect(primaryUser!.identities).toHaveLength(2);
    expect(primaryUser!.identities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: "auth2" }),
        expect.objectContaining({ provider: "mock-strategy" }),
      ]),
    );

    // The social user should be linked to the primary
    const socialUser = await env.data.users.get(
      "tenantId",
      "mock-strategy|123",
    );
    expect(socialUser).toBeTruthy();
    expect(socialUser!.linked_to).toEqual("auth2|primary-user");

    // The authorization code should reference the primary user, not the social user
    const redirectUri = new URL(location!);
    const authCode = redirectUri.searchParams.get("code");
    expect(authCode).toBeTruthy();
    const codeRecord = await env.data.codes.get(
      "tenantId",
      authCode!,
      "authorization_code",
    );
    expect(codeRecord).toBeTruthy();
    expect(codeRecord!.user_id).toEqual("auth2|primary-user");
  });

  it("should redirect to the callback endpoint on the original domain when domain doesn't match the current request", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Create a connection to test against
    await env.data.connections.create("tenantId", {
      id: "connectionId",
      name: "mock-strategy",
      strategy: "mock-strategy",
      options: {
        client_id: "clientId",
        client_secret: "clientSecret",
      },
    });

    // Create a custom domain for the tenant
    await env.data.customDomains.create("tenantId", {
      domain: "auth.example.com",
      custom_domain_id: "custom-domain-id",
      type: "auth0_managed_certs",
    });

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
      },
      // This login session was created with a request to auth.example.com
      authorization_url:
        "https://auth.example.com/authorize?client_id=clientId",
    });

    const state = await env.data.codes.create("tenantId", {
      code_id: nanoid(),
      code_type: "oauth2_state",
      login_id: loginSession.id,
      connection_id: "connectionId",
      code_verifier: "verifier",
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    // Make the callback request with a different host header
    const response = await oauthClient.callback.$get(
      {
        query: {
          state: state.code_id,
          code: "foo@example.com",
        },
      },
      {
        headers: {
          host: "authhero.com", // Different from the original auth.example.com
        },
      },
    );

    // Verify it's a 307 Temporary Redirect to preserve the HTTP method
    expect(response.status).toEqual(307);
    const location = response.headers.get("location");
    if (!location) {
      throw new Error("No location header");
    }

    // Verify it redirects to the callback on the original domain
    expect(location).toEqual(
      `https://auth.example.com/callback?state=${state.code_id}&code=foo%40example.com`,
    );

    // Verify no user operations were performed yet (since we're redirecting)
    const logs = await env.data.logs.list("tenantId");
    expect(logs).toHaveLength(0);
  });

  it("should complete callback successfully when login session has expired during processing", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    await env.data.connections.create("tenantId", {
      id: "connectionId",
      name: "mock-strategy",
      strategy: "mock-strategy",
      options: {
        client_id: "clientId",
        client_secret: "clientSecret",
      },
    });

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
      },
    });

    const state = await env.data.codes.create("tenantId", {
      code_id: nanoid(),
      code_type: "oauth2_state",
      login_id: loginSession.id,
      connection_id: "connectionId",
      code_verifier: "verifier",
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    // Simulate session expiring during processing
    await env.data.loginSessions.update("tenantId", loginSession.id, {
      state: LoginSessionState.EXPIRED,
    });

    const response = await oauthClient.callback.$get({
      query: {
        state: state.code_id,
        code: "foo@example.com",
      },
    });

    // Should still succeed with a redirect containing an authorization code
    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    expect(location).toBeTruthy();
    const redirectUri = new URL(location!);
    expect(redirectUri.pathname).toEqual("/callback");
    expect(redirectUri.searchParams.get("code")).toBeTruthy();
  });

  it("should redirect to login with meaningful error when login session is already completed", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    await env.data.connections.create("tenantId", {
      id: "connectionId",
      name: "mock-strategy",
      strategy: "mock-strategy",
      options: {
        client_id: "clientId",
        client_secret: "clientSecret",
      },
    });

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
      },
    });

    const state = await env.data.codes.create("tenantId", {
      code_id: nanoid(),
      code_type: "oauth2_state",
      login_id: loginSession.id,
      connection_id: "connectionId",
      code_verifier: "verifier",
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    // Simulate a duplicate callback that already completed the session
    await env.data.loginSessions.update("tenantId", loginSession.id, {
      state: LoginSessionState.COMPLETED,
    });

    const response = await oauthClient.callback.$get({
      query: {
        state: state.code_id,
        code: "foo@example.com",
      },
    });

    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    expect(location).toBeTruthy();
    const redirectUri = new URL(location!);
    expect(redirectUri.pathname).toEqual("/u/login/identifier");
    // Should include a meaningful error_description, not just "access_denied"
    const errorDescription = redirectUri.searchParams.get("error_description");
    expect(errorDescription).toBeTruthy();
    expect(errorDescription).not.toEqual("access_denied");
  });

  it("should redirect to login with failure reason when login session has failed", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    await env.data.connections.create("tenantId", {
      id: "connectionId",
      name: "mock-strategy",
      strategy: "mock-strategy",
      options: {
        client_id: "clientId",
        client_secret: "clientSecret",
      },
    });

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
      },
    });

    const state = await env.data.codes.create("tenantId", {
      code_id: nanoid(),
      code_type: "oauth2_state",
      login_id: loginSession.id,
      connection_id: "connectionId",
      code_verifier: "verifier",
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    // Simulate session failure with a specific reason
    await env.data.loginSessions.update("tenantId", loginSession.id, {
      state: LoginSessionState.FAILED,
      failure_reason: "User account locked",
    });

    const response = await oauthClient.callback.$get({
      query: {
        state: state.code_id,
        code: "foo@example.com",
      },
    });

    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    expect(location).toBeTruthy();
    const redirectUri = new URL(location!);
    expect(redirectUri.pathname).toEqual("/u/login/identifier");
    // Should include the failure reason in the error description
    const errorDescription = redirectUri.searchParams.get("error_description");
    expect(errorDescription).toContain("User account locked");
  });
});
