import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { DataAdapters } from "@authhero/adapter-interfaces";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import { createTestRefreshToken } from "../../helpers/refresh-token";
import { seedTenant, seedUsers } from "../../helpers/seed-tenant";

/**
 * The two user-scoped refresh-token routes in
 * `src/routes/management-api/users.ts`:
 *
 * - `GET /api/v2/users/{user_id}/refresh-tokens`
 * - `DELETE /api/v2/users/{user_id}/refresh-tokens`
 *
 * The sibling `/api/v2/refresh-tokens/{id}` routes are covered in
 * `refresh-tokens.spec.ts`; these two had no endpoint coverage at all.
 */

const device = {
  last_ip: "",
  initial_ip: "",
  last_user_agent: "",
  initial_user_agent: "",
  initial_asn: "",
  last_asn: "",
};

async function seedRefreshToken(
  env: { data: DataAdapters },
  tenantId: string,
  id: string,
  overrides: { user_id?: string; family_id?: string } = {},
) {
  await createTestRefreshToken(env, tenantId, {
    id,
    login_id: "loginSessionId",
    user_id: overrides.user_id ?? "email|userId",
    client_id: "clientId",
    resource_servers: [{ audience: "https://example.com", scopes: "openid" }],
    device,
    rotating: false,
    ...(overrides.family_id ? { family_id: overrides.family_id } : {}),
  });
}

async function setup() {
  const { managementApp, env } = await getTestServer();
  return {
    env,
    managementClient: testClient(managementApp, env),
    token: await getAdminToken(),
  };
}

describe("management-api user refresh tokens", () => {
  describe("GET /api/v2/users/{user_id}/refresh-tokens", () => {
    it("returns only the addressed user's tokens", async () => {
      const { env, managementClient, token } = await setup();
      await seedUsers(env.data, "tenantId", ["email|otherUserId"]);
      await seedRefreshToken(env, "tenantId", "ownToken");
      await seedRefreshToken(env, "tenantId", "otherUsersToken", {
        user_id: "email|otherUserId",
      });

      const response = await managementClient.users[":user_id"][
        "refresh-tokens"
      ].$get(
        {
          param: { user_id: "email|userId" },
          query: {},
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as Array<{ id: string }>;
      expect(body.map((t) => t.id)).toEqual(["ownToken"]);
    });

    it("never returns the secret material or the rotation bookkeeping", async () => {
      const { env, managementClient, token } = await setup();
      await seedRefreshToken(env, "tenantId", "refreshTokenId", {
        family_id: "familyId",
      });

      const response = await managementClient.users[":user_id"][
        "refresh-tokens"
      ].$get(
        {
          param: { user_id: "email|userId" },
          query: {},
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as Array<Record<string, unknown>>;
      expect(body).toHaveLength(1);
      // The row really does carry a lookup/hash and a family id — the response
      // schema is what strips them.
      const stored = await env.data.refreshTokens.get(
        "tenantId",
        "refreshTokenId",
      );
      expect(stored?.token_lookup).toBeTruthy();
      expect(stored?.token_hash).toBeTruthy();
      expect(stored?.family_id).toBe("familyId");

      for (const key of [
        "token_lookup",
        "token_hash",
        "family_id",
        "rotated_to",
        "rotated_at",
      ]) {
        expect(body[0]).not.toHaveProperty(key);
      }
    });

    it("returns an empty array for a user with no refresh tokens", async () => {
      const { managementClient, token } = await setup();

      const response = await managementClient.users[":user_id"][
        "refresh-tokens"
      ].$get(
        {
          param: { user_id: "email|does-not-exist" },
          query: {},
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      // The route lists rather than reads, so an unknown user is an empty
      // list rather than a 404 — same as Auth0.
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
    });

    it("returns the totals envelope when include_totals is set", async () => {
      const { env, managementClient, token } = await setup();
      await seedRefreshToken(env, "tenantId", "tokenOne");
      await seedRefreshToken(env, "tenantId", "tokenTwo");

      const response = await managementClient.users[":user_id"][
        "refresh-tokens"
      ].$get(
        {
          param: { user_id: "email|userId" },
          query: { include_totals: "true" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        tokens: Array<{ id: string }>;
        start: number;
        limit: number;
        length: number;
      };
      expect(body.tokens.map((t) => t.id).sort()).toEqual([
        "tokenOne",
        "tokenTwo",
      ]);
      expect(body.start).toBe(0);
      expect(body.limit).toBe(50);
      expect(body.length).toBe(2);
    });

    it("returns the checkpoint envelope when take is set", async () => {
      const { env, managementClient, token } = await setup();
      await seedRefreshToken(env, "tenantId", "tokenOne");
      await seedRefreshToken(env, "tenantId", "tokenTwo");

      const firstPage = await managementClient.users[":user_id"][
        "refresh-tokens"
      ].$get(
        {
          param: { user_id: "email|userId" },
          query: { take: "1" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(firstPage.status).toBe(200);
      const first = (await firstPage.json()) as {
        tokens: Array<{ id: string }>;
        next?: string;
      };
      expect(first.tokens).toHaveLength(1);
      expect(first.next).toBeTruthy();

      const secondPage = await managementClient.users[":user_id"][
        "refresh-tokens"
      ].$get(
        {
          param: { user_id: "email|userId" },
          query: { take: "1", from: first.next },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(secondPage.status).toBe(200);
      const second = (await secondPage.json()) as {
        tokens: Array<{ id: string }>;
      };
      expect(second.tokens).toHaveLength(1);
      expect(
        [...first.tokens, ...second.tokens].map((t) => t.id).sort(),
      ).toEqual(["tokenOne", "tokenTwo"]);
    });

    it("does not widen the match when the user id contains a Lucene OR", async () => {
      const { env, managementClient, token } = await setup();
      // The handler filters on an exact `user_id` predicate rather than a `q`
      // string precisely because the Lucene grammar splits on ` OR ` before
      // tokenizing. Pin that: a user whose id carries an injected clause must
      // still only see its own (zero) tokens.
      const craftedUserId = "email|crafted OR user_id:email|userId OR ";
      await seedUsers(env.data, "tenantId", [craftedUserId]);
      await seedRefreshToken(env, "tenantId", "victimToken");

      const response = await managementClient.users[":user_id"][
        "refresh-tokens"
      ].$get(
        {
          param: { user_id: craftedUserId },
          query: {},
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
    });

    it("does not return a token of another tenant", async () => {
      const { env, managementClient, token } = await setup();
      await seedTenant(env.data, "otherTenant", {
        clientId: "clientId",
        userIds: ["email|userId"],
      });
      await seedRefreshToken(env, "otherTenant", "otherTenantsToken");

      const response = await managementClient.users[":user_id"][
        "refresh-tokens"
      ].$get(
        {
          param: { user_id: "email|userId" },
          query: {},
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
    });
  });

  describe("DELETE /api/v2/users/{user_id}/refresh-tokens", () => {
    it("soft-revokes every token of the user and keeps the rows", async () => {
      const { env, managementClient, token } = await setup();
      await seedRefreshToken(env, "tenantId", "tokenOne");
      await seedRefreshToken(env, "tenantId", "tokenTwo");

      const response = await managementClient.users[":user_id"][
        "refresh-tokens"
      ].$delete(
        {
          param: { user_id: "email|userId" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(204);

      // Soft revoke: the rows survive with `revoked_at` set so the audit trail
      // still shows what was invalidated and when.
      for (const id of ["tokenOne", "tokenTwo"]) {
        const stored = await env.data.refreshTokens.get("tenantId", id);
        expect(stored).not.toBeNull();
        expect(stored?.revoked_at).toBeTruthy();
      }
    });

    it("leaves another user's tokens alone", async () => {
      const { env, managementClient, token } = await setup();
      await seedUsers(env.data, "tenantId", ["email|otherUserId"]);
      await seedRefreshToken(env, "tenantId", "ownToken");
      await seedRefreshToken(env, "tenantId", "otherUsersToken", {
        user_id: "email|otherUserId",
      });

      const response = await managementClient.users[":user_id"][
        "refresh-tokens"
      ].$delete(
        {
          param: { user_id: "email|userId" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(204);
      const untouched = await env.data.refreshTokens.get(
        "tenantId",
        "otherUsersToken",
      );
      expect(untouched?.revoked_at).toBeFalsy();
    });

    it("leaves the same user's tokens in another tenant alone", async () => {
      const { env, managementClient, token } = await setup();
      await seedTenant(env.data, "otherTenant", {
        clientId: "clientId",
        userIds: ["email|userId"],
      });
      await seedRefreshToken(env, "tenantId", "ownToken");
      await seedRefreshToken(env, "otherTenant", "otherTenantsToken");

      const response = await managementClient.users[":user_id"][
        "refresh-tokens"
      ].$delete(
        {
          param: { user_id: "email|userId" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(204);
      const untouched = await env.data.refreshTokens.get(
        "otherTenant",
        "otherTenantsToken",
      );
      expect(untouched?.revoked_at).toBeFalsy();
    });

    it("is idempotent and does not overwrite the first revocation timestamp", async () => {
      const { env, managementClient, token } = await setup();
      await seedRefreshToken(env, "tenantId", "refreshTokenId");

      const revoke = () =>
        managementClient.users[":user_id"]["refresh-tokens"].$delete(
          {
            param: { user_id: "email|userId" },
            header: { "tenant-id": "tenantId" },
          },
          { headers: { authorization: `Bearer ${token}` } },
        );

      expect((await revoke()).status).toBe(204);
      const firstRevokedAt = (
        await env.data.refreshTokens.get("tenantId", "refreshTokenId")
      )?.revoked_at;
      expect(firstRevokedAt).toBeTruthy();

      expect((await revoke()).status).toBe(204);
      const secondRevokedAt = (
        await env.data.refreshTokens.get("tenantId", "refreshTokenId")
      )?.revoked_at;
      expect(secondRevokedAt).toBe(firstRevokedAt);
    });

    it("answers 204 for a user with no refresh tokens", async () => {
      const { managementClient, token } = await setup();

      const response = await managementClient.users[":user_id"][
        "refresh-tokens"
      ].$delete(
        {
          param: { user_id: "email|does-not-exist" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(204);
    });
  });
});
