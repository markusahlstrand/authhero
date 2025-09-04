import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";

describe("impersonation routes", () => {
  describe("GET /u/impersonate", () => {
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

      // Create login session first
      const loginSession = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
        csrf_token: "csrfToken",
        authParams: {
          client_id: "clientId",
          username: "user@example.com",
          scope: "openid",
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
