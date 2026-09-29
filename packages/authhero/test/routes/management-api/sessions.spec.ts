import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { DataAdapters } from "@authhero/adapter-interfaces";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import { seedTenant } from "../../helpers/seed-tenant";

const device = {
  last_ip: "",
  initial_ip: "",
  last_user_agent: "",
  initial_user_agent: "",
  initial_asn: "",
  last_asn: "",
};

/**
 * Seed a login session + session pair in an arbitrary tenant. The shared
 * `createSessions` helper is pinned to "tenantId", and the isolation cases
 * here need a second tenant.
 */
async function seedSession(
  data: DataAdapters,
  tenantId: string,
  sessionId: string,
) {
  const loginSession = await data.loginSessions.create(tenantId, {
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    csrf_token: "csrfToken",
    authParams: {
      client_id: "clientId",
      audience: "https://example.com",
    },
  });

  const session = await data.sessions.create(tenantId, {
    id: sessionId,
    login_session_id: loginSession.id,
    user_id: "email|userId",
    clients: ["clientId"],
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    used_at: new Date().toISOString(),
    device,
  });

  await data.loginSessions.update(tenantId, loginSession.id, {
    session_id: session.id,
  });

  return { loginSession, session };
}

// The refresh-token cascade behind DELETE and /revoke has its own suite in
// test/management-api/session-revoke-cascade.test.ts; this file covers the
// endpoint contract itself (status codes, 404s, tenant isolation).
describe("management-api sessions", () => {
  async function setup() {
    const { managementApp, env } = await getTestServer();
    return {
      env,
      managementClient: testClient(managementApp, env),
      token: await getAdminToken(),
    };
  }

  describe("GET /api/v2/sessions/{id}", () => {
    it("returns the session", async () => {
      const { env, managementClient, token } = await setup();
      const { session } = await seedSession(env.data, "tenantId", "sessionId");

      const response = await managementClient.sessions[":id"].$get(
        {
          param: { id: session.id },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        id: string;
        user_id: string;
        clients: string[];
      };
      expect(body.id).toBe("sessionId");
      expect(body.user_id).toBe("email|userId");
      expect(body.clients).toEqual(["clientId"]);
    });

    it("returns 404 for an unknown session", async () => {
      const { managementClient, token } = await setup();

      const response = await managementClient.sessions[":id"].$get(
        {
          param: { id: "does-not-exist" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
    });

    it("returns 404 when the session belongs to another tenant", async () => {
      const { env, managementClient, token } = await setup();
      await seedTenant(env.data, "otherTenant", {
        clientId: "clientId",
        userIds: ["email|userId"],
      });
      await seedSession(env.data, "otherTenant", "otherSessionId");

      const response = await managementClient.sessions[":id"].$get(
        {
          param: { id: "otherSessionId" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /api/v2/sessions/{id}", () => {
    it("removes the session", async () => {
      const { env, managementClient, token } = await setup();
      const { session } = await seedSession(env.data, "tenantId", "sessionId");

      const response = await managementClient.sessions[":id"].$delete(
        {
          param: { id: session.id },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      expect(await env.data.sessions.get("tenantId", "sessionId")).toBeNull();
    });

    it("returns 404 for an unknown session", async () => {
      const { managementClient, token } = await setup();

      const response = await managementClient.sessions[":id"].$delete(
        {
          param: { id: "does-not-exist" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
    });

    it("does not remove a session of another tenant", async () => {
      const { env, managementClient, token } = await setup();
      await seedTenant(env.data, "otherTenant", {
        clientId: "clientId",
        userIds: ["email|userId"],
      });
      await seedSession(env.data, "otherTenant", "otherSessionId");

      const response = await managementClient.sessions[":id"].$delete(
        {
          param: { id: "otherSessionId" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
      expect(
        await env.data.sessions.get("otherTenant", "otherSessionId"),
      ).not.toBeNull();
    });
  });

  describe("POST /api/v2/sessions/{id}/revoke", () => {
    it("stamps revoked_at on the session", async () => {
      const { env, managementClient, token } = await setup();
      const { session } = await seedSession(env.data, "tenantId", "sessionId");

      const response = await managementClient.sessions[":id"].revoke.$post(
        {
          param: { id: session.id },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(202);

      const revoked = await env.data.sessions.get("tenantId", "sessionId");
      expect(revoked?.revoked_at).toBeTruthy();
    });

    it("returns 404 for an unknown session", async () => {
      const { managementClient, token } = await setup();

      const response = await managementClient.sessions[":id"].revoke.$post(
        {
          param: { id: "does-not-exist" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
    });

    it("does not revoke a session of another tenant", async () => {
      const { env, managementClient, token } = await setup();
      await seedTenant(env.data, "otherTenant", {
        clientId: "clientId",
        userIds: ["email|userId"],
      });
      await seedSession(env.data, "otherTenant", "otherSessionId");

      const response = await managementClient.sessions[":id"].revoke.$post(
        {
          param: { id: "otherSessionId" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
      const untouched = await env.data.sessions.get(
        "otherTenant",
        "otherSessionId",
      );
      expect(untouched?.revoked_at).toBeFalsy();
    });
  });
});
