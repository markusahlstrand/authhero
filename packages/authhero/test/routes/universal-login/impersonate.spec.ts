import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { createSessions } from "../../helpers/create-session";
import { parseJWT } from "oslo/jwt";
import {
  LogTypes,
  AuthorizationResponseType,
} from "@authhero/adapter-interfaces";

describe("impersonation routes", () => {
  describe("GET /u/impersonate", () => {
    it("should trigger postLogin hook and redirect to impersonation page after check-sessions", async () => {
      const { universalApp, oauthApp, env } = await getTestServer();
      const universalClient = testClient(universalApp, env);
      const oauthClient = testClient(oauthApp, env);

      // Create user with impersonation permission
      await env.data.users.create("tenantId", {
        user_id: "auth2|user123",
        email: "user@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });

      // Assign impersonation permission to the user
      await env.data.userPermissions.create("tenantId", "auth2|user123", {
        user_id: "auth2|user123",
        resource_server_identifier: "https://api.example.com/",
        permission_name: "users:impersonate",
      });

      // Mock the hooks.list method to return a page hook for impersonation
      // Page hooks are not stored in the database but recognized by the postUserLoginHook function
      const originalHooksList = env.data.hooks.list;
      env.data.hooks.list = async (tenant_id: string, query: any) => {
        const result = await originalHooksList(tenant_id, query);
        if (query.q === "trigger_id:post-user-login") {
          // Add a page hook to the results
          result.hooks.push({
            hook_id: "hook_impersonate_001",
            enabled: true,
            trigger_id: "post-user-login",
            page_id: "impersonate",
            permission_required: "users:impersonate",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            synchronous: false,
            // This is neither a webhook nor form hook, but a page hook
          } as any);
        }
        return result;
      };

      // Create an existing session (simulating a user who was already logged in)
      const { session: existingSession } = await createSessions(env.data);

      // Update the session to use our test user
      await env.data.sessions.update("tenantId", existingSession.id, {
        user_id: "auth2|user123",
      });

      // Start a new authorization flow (with existing session cookie)
      const authorizeResponse = await oauthClient.authorize.$get(
        {
          query: {
            client_id: "clientId",
            redirect_uri: "https://example.com/callback",
            state: "auth-state",
            nonce: "nonce",
            scope: "openid email profile",
            response_type: AuthorizationResponseType.CODE,
          },
        },
        {
          headers: {
            cookie: `tenantId-auth-token=${existingSession.id}`,
          },
        },
      );

      expect(authorizeResponse.status).toBe(302);

      // Should redirect to check-account page
      const authorizeLocation = authorizeResponse.headers.get("location");
      expect(authorizeLocation).toContain("/u/check-account");

      const universalUrl = new URL(`https://example.com${authorizeLocation}`);
      const state = universalUrl.searchParams.get("state");
      expect(state).toBeTruthy();

      // Verify check-account redirects to impersonation page due to postLogin hook
      const checkAccountResponse = await universalClient["check-account"].$post(
        {
          query: { state: state! },
        },
        {
          headers: {
            cookie: `tenantId-auth-token=${existingSession.id}`,
          },
        },
      );

      expect(checkAccountResponse.status).toBe(302);
      const checkAccountLocation = checkAccountResponse.headers.get("location");
      expect(checkAccountLocation).toContain("/u/impersonate");
      expect(checkAccountLocation).toContain(
        `state=${encodeURIComponent(state!)}`,
      );

      // Verify the impersonation page renders correctly
      const impersonateResponse = await universalClient.impersonate.$get({
        query: { state: state! },
      });

      expect(impersonateResponse.status).toBe(200);
      const html = await impersonateResponse.text();
      expect(html).toContain("user@example.com");
    });

    it("should render impersonation page when user has session", async () => {
      const { universalApp, env } = await getTestServer();
      const universalClient = testClient(universalApp, env);

      // Create user
      await env.data.users.create("tenantId", {
        user_id: "auth2|user123",
        email: "user@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });

      // Assign impersonation permission to user
      await env.data.userPermissions.create("tenantId", "auth2|user123", {
        user_id: "auth2|user123",
        resource_server_identifier: "https://api.example.com/",
        permission_name: "users:impersonate",
      });

      // Create login session and session using helper
      const { loginSession, session } = await createSessions(env.data);

      // Update the session to use our test user
      await env.data.sessions.update("tenantId", session.id, {
        user_id: "auth2|user123",
      });

      const response = await universalClient.impersonate.$get({
        query: { state: loginSession.id },
      });

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("user@example.com");
    });

    it("should throw error when no session is linked", async () => {
      const { universalApp, env } = await getTestServer();
      const universalClient = testClient(universalApp, env);

      // Create login session without session_id
      const loginSession = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
        csrf_token: "csrfToken",
        authParams: {
          client_id: "clientId",
          username: "user@example.com",
          scope: "openid",
        },
      });

      const response = await universalClient.impersonate.$get({
        query: { state: loginSession.id },
      });

      expect(response.status).toBe(400);
    });

    it("should deny access when user lacks impersonation permission", async () => {
      const { universalApp, env } = await getTestServer();
      const universalClient = testClient(universalApp, env);

      // Create user without permission
      await env.data.users.create("tenantId", {
        user_id: "auth2|user123",
        email: "user@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });

      // Create login session
      const loginSession = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
        csrf_token: "csrfToken",
        authParams: {
          client_id: "clientId",
          username: "user@example.com",
          scope: "openid",
          redirect_uri: "http://localhost:3000/callback",
        },
      });

      // Create a session
      const session = await env.data.sessions.create("tenantId", {
        id: "session123",
        user_id: "auth2|user123",
        login_session_id: loginSession.id,
        clients: ["clientId"],
        expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        device: {
          last_ip: "",
          initial_ip: "",
          last_user_agent: "",
          initial_user_agent: "",
          initial_asn: "",
          last_asn: "",
        },
      });

      // Link session to login session
      await env.data.loginSessions.update("tenantId", loginSession.id, {
        session_id: session.id,
      });

      const response = await universalClient.impersonate.$get({
        query: { state: loginSession.id },
      });

      expect(response.status).toBe(403);
      const html = await response.text();
      expect(html).toContain("Access Denied");
    });
  });

  describe("POST /u/impersonate/continue", () => {
    it("should redirect to continue authentication flow", async () => {
      const { universalApp, env } = await getTestServer();
      const universalClient = testClient(universalApp, env);

      // Create user
      await env.data.users.create("tenantId", {
        user_id: "auth2|user123",
        email: "user@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });

      // Assign impersonation permission to user
      await env.data.userPermissions.create("tenantId", "auth2|user123", {
        user_id: "auth2|user123",
        resource_server_identifier: "https://api.example.com/",
        permission_name: "users:impersonate",
      });

      // Create login session
      const loginSession = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
        csrf_token: "csrfToken",
        authParams: {
          client_id: "clientId",
          username: "user@example.com",
          scope: "openid",
          redirect_uri: "http://localhost:3000/callback",
        },
      });

      // Create a session
      const session = await env.data.sessions.create("tenantId", {
        id: "session123",
        user_id: "auth2|user123",
        login_session_id: loginSession.id,
        clients: ["clientId"],
        expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        device: {
          last_ip: "",
          initial_ip: "",
          last_user_agent: "",
          initial_user_agent: "",
          initial_asn: "",
          last_asn: "",
        },
      });

      // Link session to login session
      await env.data.loginSessions.update("tenantId", loginSession.id, {
        session_id: session.id,
      });

      const response = await universalClient.impersonate.continue.$post({
        query: { state: loginSession.id },
      });

      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toBeTruthy();
    });
  });

  describe("POST /u/impersonate/switch", () => {
    it("should allow impersonation when user has permission", async () => {
      const { universalApp, env } = await getTestServer();
      const universalClient = testClient(universalApp, env);

      // Create admin user
      await env.data.users.create("tenantId", {
        user_id: "auth2|admin123",
        email: "admin@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });

      // Create target user
      await env.data.users.create("tenantId", {
        user_id: "auth2|target123",
        email: "target@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });

      // Assign impersonation permission to admin
      await env.data.userPermissions.create("tenantId", "auth2|admin123", {
        user_id: "auth2|admin123",
        resource_server_identifier: "https://api.example.com/",
        permission_name: "users:impersonate",
      });

      // Create login session
      const loginSession = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
        csrf_token: "csrfToken",
        authParams: {
          client_id: "clientId",
          username: "admin@example.com",
          scope: "openid",
          redirect_uri: "http://localhost:3000/callback",
        },
      });

      // Create a session for admin user
      const session = await env.data.sessions.create("tenantId", {
        id: "session123",
        user_id: "auth2|admin123",
        login_session_id: loginSession.id,
        clients: ["clientId"],
        expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        device: {
          last_ip: "",
          initial_ip: "",
          last_user_agent: "",
          initial_user_agent: "",
          initial_asn: "",
          last_asn: "",
        },
      });

      // Link session to login session
      await env.data.loginSessions.update("tenantId", loginSession.id, {
        session_id: session.id,
      });

      const response = await universalClient.impersonate.switch.$post({
        query: { state: loginSession.id },
        form: { user_id: "auth2|target123" },
      });

      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toBeTruthy();
    });

    it("should deny impersonation when user lacks permission", async () => {
      const { universalApp, env } = await getTestServer();
      const universalClient = testClient(universalApp, env);

      // Create user without permission
      await env.data.users.create("tenantId", {
        user_id: "auth2|user123",
        email: "user@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });

      // Create target user
      await env.data.users.create("tenantId", {
        user_id: "auth2|target123",
        email: "target@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });

      // Create login session
      const loginSession = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
        csrf_token: "csrfToken",
        authParams: {
          client_id: "clientId",
          username: "user@example.com",
          scope: "openid",
          redirect_uri: "http://localhost:3000/callback",
        },
      });

      // Create a session for user
      const session = await env.data.sessions.create("tenantId", {
        id: "session123",
        user_id: "auth2|user123",
        login_session_id: loginSession.id,
        clients: ["clientId"],
        expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        device: {
          last_ip: "",
          initial_ip: "",
          last_user_agent: "",
          initial_user_agent: "",
          initial_asn: "",
          last_asn: "",
        },
      });

      // Link session to login session
      await env.data.loginSessions.update("tenantId", loginSession.id, {
        session_id: session.id,
      });

      const response = await universalClient.impersonate.switch.$post({
        query: { state: loginSession.id },
        form: { user_id: "auth2|target123" },
      });

      expect(response.status).toBe(403);
      const html = await response.text();
      expect(html).toContain("Access Denied");
    });

    it("should return error when target user does not exist", async () => {
      const { universalApp, env } = await getTestServer();
      const universalClient = testClient(universalApp, env);

      // Create admin user
      await env.data.users.create("tenantId", {
        user_id: "auth2|admin123",
        email: "admin@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });

      // Assign impersonation permission to admin
      await env.data.userPermissions.create("tenantId", "auth2|admin123", {
        user_id: "auth2|admin123",
        resource_server_identifier: "https://api.example.com/",
        permission_name: "users:impersonate",
      });

      // Create login session
      const loginSession = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
        csrf_token: "csrfToken",
        authParams: {
          client_id: "clientId",
          username: "admin@example.com",
          scope: "openid",
          redirect_uri: "http://localhost:3000/callback",
        },
      });

      // Create a session for admin user
      const session = await env.data.sessions.create("tenantId", {
        id: "session123",
        user_id: "auth2|admin123",
        login_session_id: loginSession.id,
        clients: ["clientId"],
        expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        device: {
          last_ip: "",
          initial_ip: "",
          last_user_agent: "",
          initial_user_agent: "",
          initial_asn: "",
          last_asn: "",
        },
      });

      // Link session to login session
      await env.data.loginSessions.update("tenantId", loginSession.id, {
        session_id: session.id,
      });

      const response = await universalClient.impersonate.switch.$post({
        query: { state: loginSession.id },
        form: { user_id: "auth2|nonexistent" },
      });

      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("not found");
    });
  });

  describe("Social login with impersonation", () => {
    it("should trigger impersonation page after social login callback when user has permission", async () => {
      const { oauthApp, env } = await getTestServer();
      const oauthClient = testClient(oauthApp, env);

      // Create user with impersonation permission
      // Note: mock-strategy returns sub: "123" for any code that's not "foo@example.com"
      await env.data.users.create("tenantId", {
        user_id: "mock-strategy|123",
        email: "hello@example.com",
        email_verified: true,
        provider: "mock-strategy",
        connection: "mock-strategy",
        is_social: true,
      });

      // Assign impersonation permission to the user
      await env.data.userPermissions.create("tenantId", "mock-strategy|123", {
        user_id: "mock-strategy|123",
        resource_server_identifier: "https://api.example.com/",
        permission_name: "users:impersonate",
      });

      // Mock the hooks.list method to return a page hook for impersonation
      // Page hooks are not stored in the database but recognized by the postUserLoginHook function
      const originalHooksList = env.data.hooks.list;
      env.data.hooks.list = async (tenant_id: string, query?: any) => {
        const result = await originalHooksList(tenant_id, query);
        if (query?.q === "trigger_id:post-user-login") {
          result.hooks.push({
            hook_id: "hook_impersonate_social",
            enabled: true,
            trigger_id: "post-user-login",
            page_id: "impersonate",
            permission_required: "users:impersonate",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            synchronous: false,
          } as any);
        }
        return result;
      };

      // Create a connection for social login
      await env.data.connections.create("tenantId", {
        id: "google-connection",
        name: "mock-strategy",
        strategy: "mock-strategy",
        options: {
          client_id: "google-client-id",
          client_secret: "google-client-secret",
        },
      });

      // Create login session (simulating /authorize redirect to Google)
      const loginSession = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        csrf_token: "csrfToken",
        authParams: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "auth-state",
          scope: "openid email profile",
          response_type: AuthorizationResponseType.CODE,
        },
      });

      // Create state code (simulating what connectionAuth creates)
      const state = await env.data.codes.create("tenantId", {
        code_id: "oauth2-state-123",
        code_type: "oauth2_state",
        login_id: loginSession.id,
        connection_id: "google-connection",
        code_verifier: "verifier",
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      });

      // Simulate callback from Google (user returns with auth code)
      // The mock-strategy returns sub: "123" and email: "hello@example.com" for any code
      const callbackResponse = await oauthClient.callback.$get({
        query: {
          state: state.code_id,
          code: "test-auth-code",
        },
      });

      // Debug: log error if status is not what we expect
      if (callbackResponse.status !== 302) {
        const errorText = await callbackResponse.text();
        console.error(
          "Callback error (status " + callbackResponse.status + "):",
          errorText,
        );
        throw new Error(
          `Expected 302, got ${callbackResponse.status}: ${errorText}`,
        );
      }

      // Should redirect to impersonation page instead of completing auth
      expect(callbackResponse.status).toBe(302);
      const callbackLocation = callbackResponse.headers.get("location");
      expect(callbackLocation).toContain("/u/impersonate");
      expect(callbackLocation).toContain(`state=${loginSession.id}`);
    });

    it("should complete social login normally when user does not have impersonation permission", async () => {
      const { oauthApp, env } = await getTestServer();
      const oauthClient = testClient(oauthApp, env);

      // Create user WITHOUT impersonation permission
      // Note: mock-strategy returns sub: "123" for any code that's not "foo@example.com"
      await env.data.users.create("tenantId", {
        user_id: "mock-strategy|123",
        email: "hello@example.com",
        email_verified: true,
        provider: "mock-strategy",
        connection: "mock-strategy",
        is_social: true,
      });

      // Mock the hooks.list method to return a page hook for impersonation
      // Page hooks are not stored in the database but recognized by the postUserLoginHook function
      const originalHooksList = env.data.hooks.list;
      env.data.hooks.list = async (tenant_id: string, query?: any) => {
        const result = await originalHooksList(tenant_id, query);
        if (query?.q === "trigger_id:post-user-login") {
          result.hooks.push({
            hook_id: "hook_impersonate_social_2",
            enabled: true,
            trigger_id: "post-user-login",
            page_id: "impersonate",
            permission_required: "users:impersonate",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            synchronous: false,
          } as any);
        }
        return result;
      };

      // Create a connection for social login
      await env.data.connections.create("tenantId", {
        id: "google-connection-2",
        name: "mock-strategy",
        strategy: "mock-strategy",
        options: {
          client_id: "google-client-id",
          client_secret: "google-client-secret",
        },
      });

      // Create login session
      const loginSession = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        csrf_token: "csrfToken",
        authParams: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "auth-state",
          scope: "openid email profile",
          response_type: AuthorizationResponseType.CODE,
        },
      });

      // Create state code
      const state = await env.data.codes.create("tenantId", {
        code_id: "oauth2-state-456",
        code_type: "oauth2_state",
        login_id: loginSession.id,
        connection_id: "google-connection-2",
        code_verifier: "verifier",
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      });

      // Simulate callback from Google
      const callbackResponse = await oauthClient.callback.$get({
        query: {
          state: state.code_id,
          code: "test-auth-code-2",
        },
      });

      // Should complete auth normally (redirect to client callback with code)
      expect(callbackResponse.status).toBe(302);
      const callbackLocation = callbackResponse.headers.get("location");
      expect(callbackLocation).toContain("https://example.com/callback");
      expect(callbackLocation).toContain("code=");
      expect(callbackLocation).toContain("state=auth-state");
      // Should NOT redirect to impersonation page
      expect(callbackLocation).not.toContain("/u/impersonate");
    });

    it("should work with linked social accounts and check permissions on primary user", async () => {
      const { oauthApp, env } = await getTestServer();
      const oauthClient = testClient(oauthApp, env);

      // Create primary user with impersonation permission
      await env.data.users.create("tenantId", {
        user_id: "auth2|primary-user",
        email: "admin@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });

      // Assign impersonation permission to PRIMARY user
      await env.data.userPermissions.create("tenantId", "auth2|primary-user", {
        user_id: "auth2|primary-user",
        resource_server_identifier: "https://api.example.com/",
        permission_name: "users:impersonate",
      });

      // Create linked Google account (using mock-strategy)
      // Note: mock-strategy returns sub: "foo" for code "foo@example.com"
      await env.data.users.create("tenantId", {
        user_id: "mock-strategy|foo",
        email: "foo@example.com",
        email_verified: true,
        provider: "mock-strategy",
        connection: "mock-strategy",
        is_social: true,
        linked_to: "auth2|primary-user", // Linked to primary user
      });

      // Mock the hooks.list method to return a page hook for impersonation
      // Page hooks are not stored in the database but recognized by the postUserLoginHook function
      const originalHooksList = env.data.hooks.list;
      env.data.hooks.list = async (tenant_id: string, query?: any) => {
        const result = await originalHooksList(tenant_id, query);
        if (query?.q === "trigger_id:post-user-login") {
          result.hooks.push({
            hook_id: "hook_impersonate_linked",
            enabled: true,
            trigger_id: "post-user-login",
            page_id: "impersonate",
            permission_required: "users:impersonate",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            synchronous: false,
          } as any);
        }
        return result;
      };

      // Create a connection
      await env.data.connections.create("tenantId", {
        id: "google-connection-3",
        name: "mock-strategy",
        strategy: "mock-strategy",
        options: {
          client_id: "google-client-id",
          client_secret: "google-client-secret",
        },
      });

      // Create login session
      const loginSession = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        csrf_token: "csrfToken",
        authParams: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "auth-state",
          scope: "openid email profile",
          response_type: AuthorizationResponseType.CODE,
        },
      });

      // Create state code
      const state = await env.data.codes.create("tenantId", {
        code_id: "oauth2-state-789",
        code_type: "oauth2_state",
        login_id: loginSession.id,
        connection_id: "google-connection-3",
        code_verifier: "verifier",
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      });

      // Simulate callback from Google (authenticating with linked account)
      // Use "foo@example.com" as code to get sub: "foo" from mock-strategy
      const callbackResponse = await oauthClient.callback.$get({
        query: {
          state: state.code_id,
          code: "foo@example.com",
        },
      });

      // Should redirect to impersonation page because PRIMARY user has permission
      expect(callbackResponse.status).toBe(302);
      const callbackLocation = callbackResponse.headers.get("location");
      expect(callbackLocation).toContain("/u/impersonate");
      expect(callbackLocation).toContain(`state=${loginSession.id}`);
    });
  });

  describe("Impersonation token claims and logging", () => {
    it("should include act claim with impersonating user in access token according to RFC 8693", async () => {
      const { universalApp, env } = await getTestServer();
      const universalClient = testClient(universalApp, env);

      // Create admin user
      await env.data.users.create("tenantId", {
        user_id: "auth2|admin123",
        email: "admin@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });

      // Create target user
      await env.data.users.create("tenantId", {
        user_id: "auth2|target123",
        email: "target@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });

      // Assign impersonation permission to admin
      await env.data.userPermissions.create("tenantId", "auth2|admin123", {
        user_id: "auth2|admin123",
        resource_server_identifier: "https://api.example.com/",
        permission_name: "users:impersonate",
      });

      // Create login session with audience to get access token
      const loginSession = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
        csrf_token: "csrfToken",
        authParams: {
          client_id: "clientId",
          username: "admin@example.com",
          scope: "openid profile email",
          audience: "https://api.example.com/",
          redirect_uri: "https://example.com/callback",
          response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
        },
      });

      // Create a session for admin user
      const session = await env.data.sessions.create("tenantId", {
        id: "session123",
        user_id: "auth2|admin123",
        login_session_id: loginSession.id,
        clients: ["clientId"],
        expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        device: {
          last_ip: "",
          initial_ip: "",
          last_user_agent: "",
          initial_user_agent: "",
          initial_asn: "",
          last_asn: "",
        },
      });

      // Link session to login session
      await env.data.loginSessions.update("tenantId", loginSession.id, {
        session_id: session.id,
      });

      // Perform impersonation
      const response = await universalClient.impersonate.switch.$post({
        query: { state: loginSession.id },
        form: { user_id: "auth2|target123" },
      });

      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toBeTruthy();

      // Extract the access token from the URL fragment (impersonation uses implicit flow)
      const redirectUrl = new URL(location!);
      const accessTokenValue = new URLSearchParams(
        redirectUrl.hash.substring(1),
      ).get("access_token");
      expect(accessTokenValue).toBeTruthy();

      // Parse the access token and verify act claim
      const accessToken = parseJWT(accessTokenValue!);
      expect(accessToken).toBeTruthy();
      const payload = accessToken?.payload as any;

      // Verify the token is for the target user
      expect(payload.sub).toBe("auth2|target123");

      // Verify the act claim is present with the admin user (RFC 8693)
      expect(payload.act).toBeDefined();
      expect(payload.act).toEqual({ sub: "auth2|admin123" });
    });

    it("should create impersonation log with SUCCESS_LOGIN type and impersonating user in description", async () => {
      const { universalApp, env } = await getTestServer();
      const universalClient = testClient(universalApp, env);

      // Create admin user
      await env.data.users.create("tenantId", {
        user_id: "auth2|admin456",
        email: "admin456@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });

      // Create target user
      await env.data.users.create("tenantId", {
        user_id: "auth2|target456",
        email: "target456@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });

      // Assign impersonation permission to admin
      await env.data.userPermissions.create("tenantId", "auth2|admin456", {
        user_id: "auth2|admin456",
        resource_server_identifier: "https://api.example.com/",
        permission_name: "users:impersonate",
      });

      // Create login session
      const loginSession = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
        csrf_token: "csrfToken",
        authParams: {
          client_id: "clientId",
          username: "admin456@example.com",
          scope: "openid",
          redirect_uri: "http://localhost:3000/callback",
        },
      });

      // Create a session for admin user
      const session = await env.data.sessions.create("tenantId", {
        id: "session456",
        user_id: "auth2|admin456",
        login_session_id: loginSession.id,
        clients: ["clientId"],
        expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        device: {
          last_ip: "",
          initial_ip: "",
          last_user_agent: "",
          initial_user_agent: "",
          initial_asn: "",
          last_asn: "",
        },
      });

      // Link session to login session
      await env.data.loginSessions.update("tenantId", loginSession.id, {
        session_id: session.id,
      });

      // Perform impersonation
      const response = await universalClient.impersonate.switch.$post({
        query: { state: loginSession.id },
        form: { user_id: "auth2|target456" },
      });

      expect(response.status).toBe(302);

      // Check the logs
      const { logs } = await env.data.logs.list("tenantId", {
        page: 0,
        per_page: 100,
        include_totals: false,
      });

      // Find the impersonation log (should be a SUCCESS_LOGIN with impersonation in description)
      const impersonationLog = logs.find(
        (log) =>
          log.type === LogTypes.SUCCESS_LOGIN &&
          log.description?.includes("impersonated by"),
      );

      expect(impersonationLog).toBeDefined();
      expect(impersonationLog?.type).toBe(LogTypes.SUCCESS_LOGIN);

      // Verify the log shows the target user
      expect(impersonationLog?.user_id).toBe("auth2|target456");

      // Verify the log description mentions both users
      expect(impersonationLog?.description).toContain("target456@example.com");
      expect(impersonationLog?.description).toContain("impersonated by");
      expect(impersonationLog?.description).toContain("admin456@example.com");
    });

    it("should respect the original response_type from authorize request (authorization code flow)", async () => {
      const { universalApp, env } = await getTestServer();
      const universalClient = testClient(universalApp, env);

      // Create admin user with impersonation permission
      await env.data.users.create("tenantId", {
        user_id: "auth2|admin-code-flow",
        email: "admin-code@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });

      await env.data.userPermissions.create(
        "tenantId",
        "auth2|admin-code-flow",
        {
          user_id: "auth2|admin-code-flow",
          resource_server_identifier: "https://api.example.com/",
          permission_name: "users:impersonate",
        },
      );

      // Create target user to impersonate
      await env.data.users.create("tenantId", {
        user_id: "auth2|target-code-flow",
        email: "target-code@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });

      // Create login session with CODE response_type (authorization code flow)
      const loginSession = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
        csrf_token: "csrfToken",
        authParams: {
          client_id: "clientId",
          scope: "openid profile email",
          redirect_uri: "https://example.com/callback",
          response_type: AuthorizationResponseType.CODE, // Authorization code flow
          state: "original-state",
        },
      });

      // Create a session for admin user
      const session = await env.data.sessions.create("tenantId", {
        id: "session-code-flow",
        user_id: "auth2|admin-code-flow",
        login_session_id: loginSession.id,
        clients: ["clientId"],
        expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        device: {
          last_ip: "",
          initial_ip: "",
          last_user_agent: "",
          initial_user_agent: "",
          initial_asn: "",
          last_asn: "",
        },
      });

      // Link session to login session
      await env.data.loginSessions.update("tenantId", loginSession.id, {
        session_id: session.id,
      });

      // Perform impersonation
      const response = await universalClient.impersonate.switch.$post({
        query: { state: loginSession.id },
        form: { user_id: "auth2|target-code-flow" },
      });

      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toBeTruthy();

      const redirectUrl = new URL(location!);

      // IMPORTANT: Should redirect with authorization code, NOT tokens in fragment
      // The original request used response_type=code, so impersonation should respect that
      expect(redirectUrl.searchParams.get("code")).toBeTruthy();
      expect(redirectUrl.searchParams.get("state")).toBe("original-state");

      // Should NOT have tokens in the URL fragment (that's implicit flow)
      expect(redirectUrl.hash).toBe("");

      // Verify no access_token in query or fragment
      expect(redirectUrl.searchParams.get("access_token")).toBeNull();
      expect(redirectUrl.hash).not.toContain("access_token");
    });

    it("should respect the original response_type from authorize request (implicit flow)", async () => {
      const { universalApp, env } = await getTestServer();
      const universalClient = testClient(universalApp, env);

      // Create admin user with impersonation permission
      await env.data.users.create("tenantId", {
        user_id: "auth2|admin-implicit-flow",
        email: "admin-implicit@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });

      await env.data.userPermissions.create(
        "tenantId",
        "auth2|admin-implicit-flow",
        {
          user_id: "auth2|admin-implicit-flow",
          resource_server_identifier: "https://api.example.com/",
          permission_name: "users:impersonate",
        },
      );

      // Create target user to impersonate
      await env.data.users.create("tenantId", {
        user_id: "auth2|target-implicit-flow",
        email: "target-implicit@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });

      // Create login session with TOKEN_ID_TOKEN response_type (implicit flow)
      const loginSession = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
        csrf_token: "csrfToken",
        authParams: {
          client_id: "clientId",
          scope: "openid profile email",
          redirect_uri: "https://example.com/callback",
          response_type: AuthorizationResponseType.TOKEN_ID_TOKEN, // Implicit flow
          state: "original-state-implicit",
        },
      });

      // Create a session for admin user
      const session = await env.data.sessions.create("tenantId", {
        id: "session-implicit-flow",
        user_id: "auth2|admin-implicit-flow",
        login_session_id: loginSession.id,
        clients: ["clientId"],
        expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        device: {
          last_ip: "",
          initial_ip: "",
          last_user_agent: "",
          initial_user_agent: "",
          initial_asn: "",
          last_asn: "",
        },
      });

      // Link session to login session
      await env.data.loginSessions.update("tenantId", loginSession.id, {
        session_id: session.id,
      });

      // Perform impersonation
      const response = await universalClient.impersonate.switch.$post({
        query: { state: loginSession.id },
        form: { user_id: "auth2|target-implicit-flow" },
      });

      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toBeTruthy();

      const redirectUrl = new URL(location!);

      // Should have tokens in the URL fragment (implicit flow)
      expect(redirectUrl.hash).toContain("access_token");

      // In implicit flow, state is in the fragment, not search params
      const fragmentParams = new URLSearchParams(redirectUrl.hash.substring(1));
      expect(fragmentParams.get("state")).toBe("original-state-implicit");

      // Should NOT have an authorization code
      expect(redirectUrl.searchParams.get("code")).toBeNull();

      // Parse the access token and verify act claim is still present
      const accessTokenValue = fragmentParams.get("access_token");
      expect(accessTokenValue).toBeTruthy();

      const accessToken = parseJWT(accessTokenValue!);
      const payload = accessToken?.payload as any;

      // Verify the token is for the target user with act claim
      expect(payload.sub).toBe("auth2|target-implicit-flow");
      expect(payload.act).toEqual({ sub: "auth2|admin-implicit-flow" });
    });
  });

  describe("Password login with impersonation", () => {
    it("should allow impersonation after password login", async () => {
      const { universalApp, oauthApp, env } = await getTestServer({
        mockEmail: true,
      });
      const universalClient = testClient(universalApp, env);
      const oauthClient = testClient(oauthApp, env);

      // Create admin user with impersonation permission
      const bcryptjs = (await import("bcryptjs")).default;
      await env.data.users.create("tenantId", {
        user_id: "auth2|admin-pwd",
        email: "admin-pwd@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });

      // Add password for admin
      await env.data.passwords.create("tenantId", {
        user_id: "auth2|admin-pwd",
        password: await bcryptjs.hash("adminpassword123", 10),
        algorithm: "bcrypt",
        is_current: true,
      });

      // Assign impersonation permission to admin
      await env.data.userPermissions.create("tenantId", "auth2|admin-pwd", {
        user_id: "auth2|admin-pwd",
        resource_server_identifier: "https://api.example.com/",
        permission_name: "users:impersonate",
      });

      // Create target user to impersonate
      await env.data.users.create("tenantId", {
        user_id: "auth2|target-pwd",
        email: "target-pwd@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });

      // Mock the hooks.list to return impersonation page hook
      const originalHooksList = env.data.hooks.list;
      env.data.hooks.list = async (tenant_id: string, query?: any) => {
        const result = await originalHooksList(tenant_id, query);
        if (query?.q === "trigger_id:post-user-login") {
          result.hooks.push({
            hook_id: "hook_impersonate_pwd",
            enabled: true,
            trigger_id: "post-user-login",
            page_id: "impersonate",
            permission_required: "users:impersonate",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            synchronous: false,
          } as any);
        }
        return result;
      };

      // Step 1: Start OAuth authorization flow
      const authorizeResponse = await oauthClient.authorize.$get({
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "auth-state",
          nonce: "nonce",
          scope: "openid email profile",
          response_type: AuthorizationResponseType.CODE,
        },
      });

      expect(authorizeResponse.status).toBe(302);
      const authorizeLocation = authorizeResponse.headers.get("location");
      const authorizeUrl = new URL(`https://example.com${authorizeLocation}`);
      const state = authorizeUrl.searchParams.get("state");
      expect(state).toBeTruthy();

      // Step 2: Enter email on identifier page
      const identifierPostResponse =
        await universalClient.login.identifier.$post({
          query: { state: state! },
          form: { username: "admin-pwd@example.com" },
        });

      if (identifierPostResponse.status !== 302) {
        const errorBody = await identifierPostResponse.text();
        console.error("Identifier POST error:", errorBody);
      }
      expect(identifierPostResponse.status).toBe(302);

      // Step 3: Enter password on enter-password page
      const enterPasswordPostResponse = await universalClient[
        "enter-password"
      ].$post({
        query: { state: state! },
        form: { password: "adminpassword123" },
      });
      expect(enterPasswordPostResponse.status).toBe(302);

      const enterPasswordLocation =
        enterPasswordPostResponse.headers.get("location");

      // After entering password, it should either go to check-account or directly to impersonate
      // If there's an impersonation hook, it might skip check-account and go straight to impersonate
      expect(enterPasswordLocation).toBeTruthy();

      // Check if it went directly to impersonate (due to post-login hook)
      if (!enterPasswordLocation!.includes("/u/impersonate")) {
        // If it went to check-account, call it next
        expect(enterPasswordLocation).toContain("/u/check-account");

        const checkAccountUrl = new URL(
          `https://example.com${enterPasswordLocation}`,
        );
        const checkAccountState = checkAccountUrl.searchParams.get("state");
        expect(checkAccountState).toBeTruthy();

        const checkAccountResponse = await universalClient[
          "check-account"
        ].$post({
          query: { state: checkAccountState! },
        });

        expect(checkAccountResponse.status).toBe(302);
        const checkAccountLocation =
          checkAccountResponse.headers.get("location");
        expect(checkAccountLocation).toContain("/u/impersonate");

        const impersonateUrl = new URL(
          `https://example.com${checkAccountLocation}`,
        );
        const impersonateState = impersonateUrl.searchParams.get("state");
        expect(impersonateState).toBeTruthy();

        // Step 5: Verify impersonation page renders with session linked
        const impersonateGetResponse = await universalClient.impersonate.$get({
          query: { state: impersonateState! },
        });

        expect(impersonateGetResponse.status).toBe(200);
        const impersonateHtml = await impersonateGetResponse.text();
        expect(impersonateHtml).toContain("admin-pwd@example.com");
      } else {
        // It went directly to impersonate, extract the state from the location
        const impersonateUrl = new URL(
          `https://example.com${enterPasswordLocation}`,
        );
        const impersonateState = impersonateUrl.searchParams.get("state");
        expect(impersonateState).toBeTruthy();

        // Step 5: Verify impersonation page renders with session linked
        const impersonateGetResponse = await universalClient.impersonate.$get({
          query: { state: impersonateState! },
        });

        expect(impersonateGetResponse.status).toBe(200);
        const impersonateHtml = await impersonateGetResponse.text();
        expect(impersonateHtml).toContain("admin-pwd@example.com");

        // Step 6: Perform the impersonation switch
        const impersonatePostResponse =
          await universalClient.impersonate.switch.$post({
            query: { state: impersonateState! },
            form: { user_id: "auth2|target-pwd" },
          });

        expect(impersonatePostResponse.status).toBe(302);
        const impersonatePostLocation =
          impersonatePostResponse.headers.get("location");
        expect(impersonatePostLocation).toBeTruthy();

        // Verify the final redirect is to the client callback
        const finalRedirectUrl = new URL(impersonatePostLocation!);
        expect(finalRedirectUrl.searchParams.get("code")).toBeTruthy();
      }
    });
  });
});
