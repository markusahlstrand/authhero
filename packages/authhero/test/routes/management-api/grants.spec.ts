import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import { seedTenant, seedUsers } from "../../helpers/seed-tenant";

type GrantBody = {
  id: string;
  user_id: string;
  clientID: string;
  audience?: string;
  scope: string[];
};

describe("management-api grants", () => {
  async function setup() {
    const { managementApp, env } = await getTestServer();
    return {
      env,
      managementClient: testClient(managementApp, env),
      token: await getAdminToken(),
    };
  }

  describe("GET /api/v2/grants", () => {
    it("lists the grants of a tenant as a plain array", async () => {
      const { env, managementClient, token } = await setup();

      const grant = await env.data.grants.create("tenantId", {
        user_id: "email|userId",
        clientID: "clientId",
        audience: "https://example.com",
        scope: ["openid", "profile"],
      });

      const response = await managementClient.grants.$get(
        {
          query: {},
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as GrantBody[];
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({
        id: grant.id,
        user_id: "email|userId",
        clientID: "clientId",
        audience: "https://example.com",
      });
      expect(body[0].scope).toEqual(["openid", "profile"]);
    });

    it("returns a totals envelope when include_totals is set", async () => {
      const { env, managementClient, token } = await setup();

      await env.data.grants.create("tenantId", {
        user_id: "email|userId",
        clientID: "clientId",
        audience: "https://example.com",
        scope: ["openid"],
      });

      const response = await managementClient.grants.$get(
        {
          query: { include_totals: "true" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        grants: GrantBody[];
        start: number;
        limit: number;
        length: number;
      };
      expect(body.grants).toHaveLength(1);
      expect(body.length).toBe(1);
      expect(body.limit).toBe(50);
    });

    it("filters by user_id, client_id and audience", async () => {
      const { env, managementClient, token } = await setup();
      await seedUsers(env.data, "tenantId", ["email|userA", "email|userB"]);

      await env.data.grants.create("tenantId", {
        user_id: "email|userA",
        clientID: "clientId",
        audience: "https://example.com",
        scope: ["openid"],
      });
      await env.data.grants.create("tenantId", {
        user_id: "email|userB",
        clientID: "otherClientId",
        audience: "https://other.example.com",
        scope: ["openid"],
      });

      const byUser = await managementClient.grants.$get(
        {
          query: { user_id: "email|userA" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );
      expect(byUser.status).toBe(200);
      const byUserBody = (await byUser.json()) as GrantBody[];
      expect(byUserBody.map((g) => g.user_id)).toEqual(["email|userA"]);

      const byClient = await managementClient.grants.$get(
        {
          query: { client_id: "otherClientId" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );
      expect(byClient.status).toBe(200);
      const byClientBody = (await byClient.json()) as GrantBody[];
      expect(byClientBody.map((g) => g.user_id)).toEqual(["email|userB"]);

      const byAudience = await managementClient.grants.$get(
        {
          query: { audience: "https://example.com" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );
      expect(byAudience.status).toBe(200);
      const byAudienceBody = (await byAudience.json()) as GrantBody[];
      expect(byAudienceBody.map((g) => g.user_id)).toEqual(["email|userA"]);
    });

    it("does not return grants belonging to another tenant", async () => {
      const { env, managementClient, token } = await setup();
      await seedTenant(env.data, "otherTenant", {
        userIds: ["email|userId"],
      });

      await env.data.grants.create("otherTenant", {
        user_id: "email|userId",
        clientID: "clientId",
        audience: "https://example.com",
        scope: ["openid"],
      });

      const response = await managementClient.grants.$get(
        {
          query: {},
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
    });
  });

  describe("DELETE /api/v2/grants/{id}", () => {
    it("removes a single grant", async () => {
      const { env, managementClient, token } = await setup();

      const grant = await env.data.grants.create("tenantId", {
        user_id: "email|userId",
        clientID: "clientId",
        audience: "https://example.com",
        scope: ["openid"],
      });

      const response = await managementClient.grants[":id"].$delete(
        {
          param: { id: grant.id },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(204);
      const { grants } = await env.data.grants.list("tenantId", {});
      expect(grants).toHaveLength(0);
    });

    it("returns 404 for an unknown grant", async () => {
      const { managementClient, token } = await setup();

      const response = await managementClient.grants[":id"].$delete(
        {
          param: { id: "does-not-exist" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
    });

    it("returns 404 when the grant belongs to another tenant", async () => {
      const { env, managementClient, token } = await setup();
      await seedTenant(env.data, "otherTenant", {
        userIds: ["email|userId"],
      });

      const grant = await env.data.grants.create("otherTenant", {
        user_id: "email|userId",
        clientID: "clientId",
        audience: "https://example.com",
        scope: ["openid"],
      });

      const response = await managementClient.grants[":id"].$delete(
        {
          param: { id: grant.id },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
      const { grants } = await env.data.grants.list("otherTenant", {});
      expect(grants).toHaveLength(1);
    });
  });

  describe("DELETE /api/v2/grants?user_id=", () => {
    it("removes every grant of a user and leaves other users alone", async () => {
      const { env, managementClient, token } = await setup();
      await seedUsers(env.data, "tenantId", ["email|userA", "email|userB"]);

      await env.data.grants.create("tenantId", {
        user_id: "email|userA",
        clientID: "clientId",
        audience: "https://example.com",
        scope: ["openid"],
      });
      await env.data.grants.create("tenantId", {
        user_id: "email|userA",
        clientID: "otherClientId",
        audience: "https://other.example.com",
        scope: ["openid"],
      });
      await env.data.grants.create("tenantId", {
        user_id: "email|userB",
        clientID: "clientId",
        audience: "https://example.com",
        scope: ["openid"],
      });

      const response = await managementClient.grants.$delete(
        {
          query: { user_id: "email|userA" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(204);
      const { grants } = await env.data.grants.list("tenantId", {});
      expect(grants.map((g) => g.user_id)).toEqual(["email|userB"]);
    });

    it("leaves the same user's grants in another tenant untouched", async () => {
      const { env, managementClient, token } = await setup();
      await seedUsers(env.data, "tenantId", ["email|userA"]);
      await seedTenant(env.data, "otherTenant", { userIds: ["email|userA"] });

      await env.data.grants.create("tenantId", {
        user_id: "email|userA",
        clientID: "clientId",
        audience: "https://example.com",
        scope: ["openid"],
      });
      await env.data.grants.create("otherTenant", {
        user_id: "email|userA",
        clientID: "clientId",
        audience: "https://example.com",
        scope: ["openid"],
      });

      const response = await managementClient.grants.$delete(
        {
          query: { user_id: "email|userA" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(204);
      expect((await env.data.grants.list("tenantId", {})).grants).toHaveLength(
        0,
      );
      expect(
        (await env.data.grants.list("otherTenant", {})).grants,
      ).toHaveLength(1);
    });
  });
});
