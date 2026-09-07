import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import { seedTenant, seedUsers } from "../../helpers/seed-tenant";

type AuthenticationMethodBody = {
  id: string;
  type: string;
  confirmed: boolean;
  phone_number?: string;
  credential_id?: string;
  friendly_name?: string;
  created_at: string;
};

const USER_ID = "email|userId";

describe("management-api authentication-methods", () => {
  async function setup() {
    const { app, managementApp, env } = await getTestServer();
    return {
      app,
      env,
      managementClient: testClient(managementApp, env),
      token: await getAdminToken(),
    };
  }

  describe("GET /api/v2/users/{user_id}/authentication-methods", () => {
    it("lists the enrollments of a user", async () => {
      const { env, managementClient, token } = await setup();

      const enrollment = await env.data.authenticationMethods.create(
        "tenantId",
        {
          user_id: USER_ID,
          type: "phone",
          phone_number: "+46707123456",
          confirmed: true,
        },
      );

      const response = await managementClient.users[":user_id"][
        "authentication-methods"
      ].$get(
        {
          param: { user_id: USER_ID },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as AuthenticationMethodBody[];
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({
        id: enrollment.id,
        type: "phone",
        phone_number: "+46707123456",
        confirmed: true,
      });
    });

    it("does not return the enrollments of another user", async () => {
      const { env, managementClient, token } = await setup();
      await seedUsers(env.data, "tenantId", ["email|otherUser"]);

      await env.data.authenticationMethods.create("tenantId", {
        user_id: "email|otherUser",
        type: "totp",
        totp_secret: "SECRET",
        confirmed: true,
      });

      const response = await managementClient.users[":user_id"][
        "authentication-methods"
      ].$get(
        {
          param: { user_id: USER_ID },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
    });

    it("does not return the enrollments of the same user in another tenant", async () => {
      const { env, managementClient, token } = await setup();
      await seedTenant(env.data, "otherTenant", { userIds: [USER_ID] });

      await env.data.authenticationMethods.create("otherTenant", {
        user_id: USER_ID,
        type: "phone",
        phone_number: "+46707123456",
        confirmed: true,
      });

      const response = await managementClient.users[":user_id"][
        "authentication-methods"
      ].$get(
        {
          param: { user_id: USER_ID },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
    });
  });

  describe("POST /api/v2/users/{user_id}/authentication-methods", () => {
    it("enrolls a phone factor and returns it with 201", async () => {
      const { env, managementClient, token } = await setup();

      const response = await managementClient.users[":user_id"][
        "authentication-methods"
      ].$post(
        {
          param: { user_id: USER_ID },
          json: {
            type: "phone",
            phone_number: "+46707123456",
            friendly_name: "Work phone",
          },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(201);
      const body = (await response.json()) as AuthenticationMethodBody;
      expect(body).toMatchObject({
        type: "phone",
        phone_number: "+46707123456",
        friendly_name: "Work phone",
        // `confirmed` defaults to true on this endpoint, unlike the adapter
        // insert schema, whose default is false.
        confirmed: true,
      });

      const stored = await env.data.authenticationMethods.list(
        "tenantId",
        USER_ID,
      );
      expect(stored.map((method) => method.id)).toEqual([body.id]);
    });

    it("enrolls a passkey with its webauthn fields", async () => {
      const { managementClient, token } = await setup();

      const response = await managementClient.users[":user_id"][
        "authentication-methods"
      ].$post(
        {
          param: { user_id: USER_ID },
          json: {
            type: "passkey",
            credential_id: "credentialId",
            public_key: "publicKey",
            sign_count: 0,
            credential_backed_up: true,
            transports: ["internal", "hybrid"],
          },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({
        type: "passkey",
        credential_id: "credentialId",
        public_key: "publicKey",
        sign_count: 0,
        credential_backed_up: true,
        transports: ["internal", "hybrid"],
      });
    });

    it("rejects a phone factor without a phone number", async () => {
      const { app, env, token } = await setup();

      const response = await app.request(
        `/api/v2/users/${encodeURIComponent(USER_ID)}/authentication-methods`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "tenant-id": "tenantId",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ type: "phone" }),
        },
        env,
      );

      expect(response.status).toBe(400);
      expect(
        await env.data.authenticationMethods.list("tenantId", USER_ID),
      ).toEqual([]);
    });

    it("rejects a passkey without a credential", async () => {
      const { app, env, token } = await setup();

      const response = await app.request(
        `/api/v2/users/${encodeURIComponent(USER_ID)}/authentication-methods`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "tenant-id": "tenantId",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ type: "passkey", public_key: "publicKey" }),
        },
        env,
      );

      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/v2/users/{user_id}/authentication-methods/{method_id}", () => {
    it("returns a single enrollment", async () => {
      const { env, managementClient, token } = await setup();

      const enrollment = await env.data.authenticationMethods.create(
        "tenantId",
        {
          user_id: USER_ID,
          type: "totp",
          totp_secret: "SECRET",
          confirmed: true,
        },
      );

      const response = await managementClient.users[":user_id"][
        "authentication-methods"
      ][":method_id"].$get(
        {
          param: { user_id: USER_ID, method_id: enrollment.id },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as AuthenticationMethodBody;
      expect(body).toMatchObject({ id: enrollment.id, type: "totp" });
      // The shared secret is never echoed back over the management API.
      expect(body).not.toHaveProperty("totp_secret");
    });

    it("returns 404 for an unknown enrollment", async () => {
      const { managementClient, token } = await setup();

      const response = await managementClient.users[":user_id"][
        "authentication-methods"
      ][":method_id"].$get(
        {
          param: { user_id: USER_ID, method_id: "does-not-exist" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
    });

    it("returns 404 when the enrollment belongs to another user", async () => {
      const { env, managementClient, token } = await setup();
      await seedUsers(env.data, "tenantId", ["email|otherUser"]);

      const enrollment = await env.data.authenticationMethods.create(
        "tenantId",
        {
          user_id: "email|otherUser",
          type: "phone",
          phone_number: "+46707123456",
          confirmed: true,
        },
      );

      const response = await managementClient.users[":user_id"][
        "authentication-methods"
      ][":method_id"].$get(
        {
          param: { user_id: USER_ID, method_id: enrollment.id },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /api/v2/users/{user_id}/authentication-methods/{method_id}", () => {
    it("removes the enrollment", async () => {
      const { env, managementClient, token } = await setup();

      const enrollment = await env.data.authenticationMethods.create(
        "tenantId",
        {
          user_id: USER_ID,
          type: "phone",
          phone_number: "+46707123456",
          confirmed: true,
        },
      );

      const response = await managementClient.users[":user_id"][
        "authentication-methods"
      ][":method_id"].$delete(
        {
          param: { user_id: USER_ID, method_id: enrollment.id },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(204);
      expect(
        await env.data.authenticationMethods.list("tenantId", USER_ID),
      ).toEqual([]);
    });

    it("returns 404 for an unknown enrollment", async () => {
      const { managementClient, token } = await setup();

      const response = await managementClient.users[":user_id"][
        "authentication-methods"
      ][":method_id"].$delete(
        {
          param: { user_id: USER_ID, method_id: "does-not-exist" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
    });

    it("does not delete an enrollment owned by the same user in another tenant", async () => {
      const { env, managementClient, token } = await setup();
      await seedTenant(env.data, "otherTenant", { userIds: [USER_ID] });

      const enrollment = await env.data.authenticationMethods.create(
        "otherTenant",
        {
          user_id: USER_ID,
          type: "phone",
          phone_number: "+46707123456",
          confirmed: true,
        },
      );

      const response = await managementClient.users[":user_id"][
        "authentication-methods"
      ][":method_id"].$delete(
        {
          param: { user_id: USER_ID, method_id: enrollment.id },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
      expect(
        await env.data.authenticationMethods.list("otherTenant", USER_ID),
      ).toHaveLength(1);
    });
  });
});
