import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import bcryptjs from "bcryptjs";
import { getTestServer } from "../../helpers/test-server";
import { getAdminToken } from "../../helpers/token";
import { USERNAME_PASSWORD_PROVIDER } from "../../../src/constants";
import { Strategy } from "@authhero/adapter-interfaces";

/**
 * The auth-api request schemas normalize the submitted identifier with
 * `normalizeEmail` (trim + lowercase). Before issue #1279 they only lowercased,
 * so a client sending `"user@example.com "` wrote a second account that no
 * lookup for the trimmed address could ever reach.
 *
 * These cover the write side (signup stores the trimmed value) and the read
 * side (a padded identifier finds the account created with the clean one).
 */
describe("whitespace in submitted email identifiers", () => {
  describe("POST /dbconnections/signup", () => {
    it("stores the trimmed, lowercased email", async () => {
      const { oauthApp, env } = await getTestServer({ mockEmail: true });
      const client = testClient(oauthApp, env);

      const response = await client.dbconnections.signup.$post(
        {
          json: {
            email: "  Padded.Signup@Example.COM  ",
            password: "fG%D0MV4bjb%xI",
            connection: Strategy.USERNAME_PASSWORD,
            client_id: "clientId",
          },
        },
        { headers: { "tenant-id": "tenantId" } },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        email: "padded.signup@example.com",
      });

      const { users } = await env.data.users.list("tenantId", {
        page: 0,
        per_page: 10,
        include_totals: false,
        q: "email:padded.signup@example.com",
      });
      expect(users).toHaveLength(1);
      expect(users[0]?.email).toBe("padded.signup@example.com");
    });

    it("rejects a padded duplicate of an existing account", async () => {
      const { oauthApp, env } = await getTestServer({ mockEmail: true });
      const client = testClient(oauthApp, env);

      const signup = (email: string) =>
        client.dbconnections.signup.$post(
          {
            json: {
              email,
              password: "fG%D0MV4bjb%xI",
              connection: Strategy.USERNAME_PASSWORD,
              client_id: "clientId",
            },
          },
          { headers: { "tenant-id": "tenantId" } },
        );

      expect((await signup("dupe@example.com")).status).toBe(200);

      // Same person, stray whitespace. This used to sail through as a distinct
      // identifier and create a second account.
      const second = await signup(" dupe@example.com ");
      expect(second.status).toBe(400);

      const { users } = await env.data.users.list("tenantId", {
        page: 0,
        per_page: 10,
        include_totals: false,
        q: "email:dupe@example.com",
      });
      expect(users).toHaveLength(1);
    });
  });

  describe("POST /co/authenticate", () => {
    it("authenticates with a padded username", async () => {
      const { oauthApp, env } = await getTestServer();
      const oauthClient = testClient(oauthApp, env);

      await env.data.users.create("tenantId", {
        email: "padded-login@example.com",
        email_verified: true,
        name: "Test User",
        connection: Strategy.USERNAME_PASSWORD,
        provider: USERNAME_PASSWORD_PROVIDER,
        is_social: false,
        user_id: `${USERNAME_PASSWORD_PROVIDER}|padded-login`,
      });
      await env.data.passwords.create("tenantId", {
        user_id: `${USERNAME_PASSWORD_PROVIDER}|padded-login`,
        password: await bcryptjs.hash("Test1234!", 10),
        algorithm: "bcrypt",
      });

      const loginResponse = await oauthClient.co.authenticate.$post({
        json: {
          client_id: "clientId",
          credential_type: "http://auth0.com/oauth/grant-type/password-realm",
          realm: Strategy.USERNAME_PASSWORD,
          password: "Test1234!",
          username: "  Padded-Login@Example.COM  ",
        },
      });

      expect(loginResponse.status).toBe(200);
      const { login_ticket } = (await loginResponse.json()) as {
        login_ticket: string;
      };
      expect(login_ticket).toBeTypeOf("string");
    });
  });

  describe("POST /passwordless/start", () => {
    it("sends the code to the trimmed address and matches the existing user", async () => {
      const { oauthApp, managementApp, env, getSentEmails } =
        await getTestServer({ testTenantLanguage: "en" });
      const oauthClient = testClient(oauthApp, env);
      const managementClient = testClient(managementApp, env);

      const token = await getAdminToken();
      await managementClient.email.providers.$post(
        {
          header: { "tenant-id": "tenantId" },
          json: { name: "mock-email", credentials: { api_key: "apiKey" } },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      const existing = await env.data.users.create("tenantId", {
        user_id: "email|padded-passwordless",
        email: "padded-otp@example.com",
        email_verified: true,
        provider: "email",
        connection: "email",
      });

      const response = await oauthClient.passwordless.start.$post(
        {
          json: {
            client_id: "clientId",
            connection: "email",
            email: "  Padded-OTP@Example.COM  ",
            send: "code",
            authParams: {},
          },
        },
        { headers: { "x-real-ip": "1.2.3.4", "user-agent": "Mozilla/5.0" } },
      );

      expect(response.status).toBe(200);

      const emails = await getSentEmails();
      expect(emails.length).toBe(1);
      expect(emails[0]?.to).toBe("padded-otp@example.com");

      // No duplicate account spawned alongside the one that already existed.
      const { users } = await env.data.users.list("tenantId", {
        page: 0,
        per_page: 10,
        include_totals: false,
        q: "email:padded-otp@example.com",
      });
      expect(users.map((u) => u.user_id)).toEqual([existing.user_id]);
    });
  });

  describe("POST /dbconnections/change_password", () => {
    it("finds the account when the submitted email is padded", async () => {
      const { oauthApp, env, getSentEmails } = await getTestServer({
        mockEmail: true,
      });
      const client = testClient(oauthApp, env);

      await env.data.users.create("tenantId", {
        user_id: `${USERNAME_PASSWORD_PROVIDER}|padded-reset`,
        email: "padded-reset@example.com",
        email_verified: true,
        provider: USERNAME_PASSWORD_PROVIDER,
        connection: Strategy.USERNAME_PASSWORD,
      });

      const response = await client.dbconnections.change_password.$post(
        {
          json: {
            client_id: "clientId",
            connection: Strategy.USERNAME_PASSWORD,
            email: " Padded-Reset@Example.COM ",
          },
        },
        { headers: { "tenant-id": "tenantId" } },
      );

      expect(response.status).toBe(200);

      const emails = getSentEmails();
      expect(emails.length).toBe(1);

      // The lazy-create branch must not have fired: still exactly one account.
      const { users } = await env.data.users.list("tenantId", {
        page: 0,
        per_page: 10,
        include_totals: false,
        q: "email:padded-reset@example.com",
      });
      expect(users).toHaveLength(1);
    });
  });
});
