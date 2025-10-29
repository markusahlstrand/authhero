import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { testClient } from "hono/testing";

describe("signup validation hooks", () => {
  describe("validateSignupEmail", () => {
    it("should allow signup when disable_sign_ups is false", async () => {
      const { env, oauthApp } = await getTestServer({ mockEmail: true });

      const client = testClient(oauthApp, env);

      // Try to create a user via dbconnections signup
      const userResponse = await client.dbconnections.signup.$post(
        {
          json: {
            email: "newuser@example.com",
            password: "Test1234!",
            connection: "Username-Password-Authentication",
            client_id: "clientId",
          },
        },
        {
          headers: {
            "tenant-id": "tenantId",
          },
        },
      );

      expect(userResponse.status).toBe(200);
      const user = await userResponse.json();
      expect(user.email).toBe("newuser@example.com");
    });

    it("should block signup when disable_sign_ups is true", async () => {
      const { env, oauthApp } = await getTestServer({ mockEmail: true });

      // Update the client to disable signups
      await env.data.clients.update("tenantId", "clientId", {
        client_metadata: {
          disable_sign_ups: "true",
        },
      });

      const client = testClient(oauthApp, env);

      // Try to create a user via dbconnections signup
      const userResponse = await client.dbconnections.signup.$post(
        {
          json: {
            email: "blocked@example.com",
            password: "Test1234!",
            connection: "Username-Password-Authentication",
            client_id: "clientId",
          },
        },
        {
          headers: {
            "tenant-id": "tenantId",
          },
        },
      );

      expect(userResponse.status).toBe(400);
      const error = await userResponse.text();
      expect(error).toContain("Public signup is disabled");
    });

    it("should allow signup when disable_sign_ups is true but user with same email exists (for linking)", async () => {
      const { env, oauthApp } = await getTestServer({ mockEmail: true });

      // Create an existing user first
      await env.data.users.create("tenantId", {
        email: "existing@example.com",
        email_verified: true,
        connection: "email",
        provider: "email",
        is_social: false,
        user_id: "email|existing",
        name: "Existing User",
        nickname: "existing",
        picture: "",
        login_count: 0,
        last_ip: "",
        last_login: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Update the client to disable signups
      await env.data.clients.update("tenantId", "clientId", {
        client_metadata: {
          disable_sign_ups: "true",
        },
      });

      const client = testClient(oauthApp, env);

      // Try to create another user with the same email (simulating password signup)
      const socialUserResponse = await client.dbconnections.signup.$post(
        {
          json: {
            email: "existing@example.com",
            password: "Test1234!",
            connection: "Username-Password-Authentication",
            client_id: "clientId",
          },
        },
        {
          headers: {
            "tenant-id": "tenantId",
          },
        },
      );

      // Should succeed because we're linking to an existing user
      expect(socialUserResponse.status).toBe(200);
    });
  });

  describe("social login signup blocking", () => {
    it("should block email/password signup when disable_sign_ups is true", async () => {
      const { env, oauthApp } = await getTestServer({ mockEmail: true });

      // Update the client to disable signups
      await env.data.clients.update("tenantId", "clientId", {
        client_metadata: {
          disable_sign_ups: "true",
        },
      });

      const client = testClient(oauthApp, env);

      // Try to create a user via email/password
      const userResponse = await client.dbconnections.signup.$post(
        {
          json: {
            email: "password@example.com",
            password: "Test1234!",
            connection: "Username-Password-Authentication",
            client_id: "clientId",
          },
        },
        {
          headers: {
            "tenant-id": "tenantId",
          },
        },
      );

      // Should be blocked by the preUserSignupHook
      expect(userResponse.status).toBe(400);
      const error = await userResponse.text();
      expect(error).toContain("Public signup is disabled");
    });

    it("should allow email/password signup for existing user even when disable_sign_ups is true", async () => {
      const { env, oauthApp } = await getTestServer({ mockEmail: true });

      // Create an existing email user first
      await env.data.users.create("tenantId", {
        email: "user@example.com",
        email_verified: true,
        connection: "Username-Password-Authentication",
        provider: "auth0",
        is_social: false,
        user_id: "auth0|user",
        name: "Test User",
        nickname: "user",
        picture: "",
        login_count: 0,
        last_ip: "",
        last_login: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Update the client to disable signups
      await env.data.clients.update("tenantId", "clientId", {
        client_metadata: {
          disable_sign_ups: "true",
        },
      });

      const client = testClient(oauthApp, env);

      // Try signup with existing user email (should be treated as login, not signup)
      const userResponse = await client.dbconnections.signup.$post(
        {
          json: {
            email: "user@example.com",
            password: "Test1234!",
            connection: "Username-Password-Authentication",
            client_id: "clientId",
          },
        },
        {
          headers: {
            "tenant-id": "tenantId",
          },
        },
      );

      // Should succeed because user exists
      expect(userResponse.status).toBe(200);
    });
  });

  describe("preUserSignupHook logging", () => {
    it("should log failed signup when blocked by disable_sign_ups", async () => {
      const { env, oauthApp } = await getTestServer({ mockEmail: true });

      // Update the client to disable signups
      await env.data.clients.update("tenantId", "clientId", {
        client_metadata: {
          disable_sign_ups: "true",
        },
      });

      const client = testClient(oauthApp, env);

      // Try to create a user
      await client.dbconnections.signup.$post(
        {
          json: {
            email: "blocked@example.com",
            password: "Test1234!",
            connection: "Username-Password-Authentication",
            client_id: "clientId",
          },
        },
        {
          headers: {
            "tenant-id": "tenantId",
          },
        },
      );

      // Check that a log was created
      const { logs } = await env.data.logs.list("tenantId", {
        page: 0,
        per_page: 10,
        include_totals: false,
      });

      const signupLog = logs.find((log) => log.type === "fs");
      expect(signupLog).toBeDefined();
      expect(signupLog?.description).toContain("Public signup is disabled");
    });
  });
});
