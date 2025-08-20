import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { getAdminToken } from "../../helpers/token";

describe("dbconnections", () => {
  describe("signup", () => {
    it("should create a new user, create a log entry and send a code verification email", async () => {
      const { oauthApp, getSentEmails, env } = await getTestServer({
        mockEmail: true,
      });
      const client = testClient(oauthApp, env);

      const response = await client.dbconnections.signup.$post(
        {
          json: {
            email: "email-user@example.com",
            password: "fG%D0MV4bjb%xI",
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

      expect(response.status).toBe(200);

      const createdUser = await response.json();
      expect(createdUser).toMatchObject({
        app_metadata: {},
        email: "email-user@example.com",
        email_verified: false,
        user_metadata: {},
      });
      expect(createdUser._id).toBeTypeOf("string");

      const { logs } = await env.data.logs.list("tenantId");
      expect(logs.length).toBe(1);

      const emails = getSentEmails();
      expect(emails.length).toBe(1);
    });

    it("should return an error if the password is weak", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      const response = await client.dbconnections.signup.$post(
        {
          json: {
            email: "email-user@example.com",
            password: "pass",
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

      expect(response.status).toBe(400);
      const message = await response.text();
      expect(message).toBe("Password does not meet the requirements");
    });

    it("should return an error if the user allready exists", async () => {
      const { oauthApp, env } = await getTestServer({ mockEmail: true });
      const client = testClient(oauthApp, env);

      // Create the use
      await client.dbconnections.signup.$post(
        {
          json: {
            email: "email-user@example.com",
            password: "Password1!",
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

      // Create the same user again
      const response = await client.dbconnections.signup.$post(
        {
          json: {
            email: "email-user@example.com",
            password: "Password1!",
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

      expect(response.status).toBe(400);
      const message = await response.text();
      expect(message).toBe("Invalid sign up");
    });
  });

  describe("change password", async () => {
    it("should send a password reset email", async () => {
      const { oauthApp, managementApp, getSentEmails, env } =
        await getTestServer();
      const client = testClient(oauthApp, env);

      const managementClient = testClient(managementApp, env);

      const token = await getAdminToken();

      // Add the mock client
      await managementClient.email.providers.$post(
        {
          header: {
            "tenant-id": "tenantId",
          },
          json: {
            name: "mock-email",
            credentials: {
              api_key: "apiKey",
            },
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      // Create the user
      const createUserResponse = await client.dbconnections.signup.$post(
        {
          json: {
            email: "email-user@example.com",
            password: "fG%D0MV4bjb%xI",
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
      expect(createUserResponse.status).toBe(200);

      // Request a password change
      const response = await client.dbconnections.change_password.$post(
        {
          json: {
            email: "email-user@example.com",
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

      expect(response.status).toBe(200);

      const emails = getSentEmails();
      // One email for signing up and one for the password reset
      expect(emails.length).toBe(2);
    });

    it("should not send a password reset email if the user doesn't exist", async () => {
      const { oauthApp, managementApp, getSentEmails, env } =
        await getTestServer();
      const client = testClient(oauthApp, env);

      const managementClient = testClient(managementApp, env);

      const token = await getAdminToken();

      // Add the mock client
      await managementClient.email.providers.$post(
        {
          header: {
            "tenant-id": "tenantId",
          },
          json: {
            name: "mock-email",
            credentials: {
              api_key: "apiKey",
            },
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      // Request a password change
      const response = await client.dbconnections.change_password.$post(
        {
          json: {
            email: "email-user@example.com",
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

      expect(response.status).toBe(200);

      const emails = getSentEmails();
      // One email for signing up and one for the password reset
      expect(emails.length).toBe(0);
    });
  });
});
