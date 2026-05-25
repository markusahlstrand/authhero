import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";

describe("management API: /api/v2/tickets", () => {
  describe("POST /tickets/email-verification", () => {
    it("issues a ticket URL pointing at /u2/tickets/email-verification", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      const res = await client.tickets["email-verification"].$post(
        {
          json: { user_id: "email|userId" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as { ticket: string };
      expect(body.ticket).toContain("/u2/tickets/email-verification");
      expect(body.ticket).toContain("ticket=");

      // Persisted as a one-time code with type "ticket".
      const url = new URL(body.ticket);
      const ticketId = url.searchParams.get("ticket")!;
      const persisted = await env.data.codes.get(
        "tenantId",
        ticketId,
        "ticket",
      );
      expect(persisted).not.toBeNull();
      expect(persisted!.user_id).toBe("email|userId");
    });

    it("returns 404 for an unknown user", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      const res = await client.tickets["email-verification"].$post(
        {
          json: { user_id: "email|does-not-exist" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(res.status).toBe(404);
    });
  });

  describe("POST /tickets/password-change", () => {
    it("issues a ticket URL pointing at /u2/tickets/password-change", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      const res = await client.tickets["password-change"].$post(
        {
          json: { user_id: "email|userId" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as { ticket: string };
      expect(body.ticket).toContain("/u2/tickets/password-change");
    });

    it("accepts email as an alternative to user_id", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      const res = await client.tickets["password-change"].$post(
        {
          json: { email: "foo@example.com" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(res.status).toBe(201);
    });

    it("rejects requests with neither user_id nor email", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      const res = await client.tickets["password-change"].$post(
        {
          json: {},
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(res.status).toBe(400);
    });
  });
});
