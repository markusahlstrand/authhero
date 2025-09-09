import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { createSessions } from "../../helpers/create-session";

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
      await env.data.userPermissions.assign("tenantId", "auth2|user123", [
        {
          user_id: "auth2|user123",
          resource_server_identifier: "https://api.example.com/",
          permission_name: "users:impersonate",
        },
      ]);

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
      expect(html).toContain("Impersonation Panel");
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
      await env.data.userPermissions.assign("tenantId", "auth2|user123", [
        {
          user_id: "auth2|user123",
          resource_server_identifier: "https://api.example.com/",
          permission_name: "users:impersonate",
        },
      ]);

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
      expect(html).toContain("Impersonation Panel");
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
      await env.data.userPermissions.assign("tenantId", "auth2|user123", [
        {
          user_id: "auth2|user123",
          resource_server_identifier: "https://api.example.com/",
          permission_name: "users:impersonate",
        },
      ]);

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
      await env.data.userPermissions.assign("tenantId", "auth2|admin123", [
        {
          user_id: "auth2|admin123",
          resource_server_identifier: "https://api.example.com/",
          permission_name: "users:impersonate",
        },
      ]);

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
      await env.data.userPermissions.assign("tenantId", "auth2|admin123", [
        {
          user_id: "auth2|admin123",
          resource_server_identifier: "https://api.example.com/",
          permission_name: "users:impersonate",
        },
      ]);

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
});
