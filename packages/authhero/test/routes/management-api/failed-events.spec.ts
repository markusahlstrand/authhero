import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";

async function seedDeadLetteredEvent(env: any, tenantId: string, eventId = "evt-dead-1") {
  // Create an outbox event, then dead-letter it so it appears in the
  // failed-events endpoint. We bypass the relay so the test can control the
  // exact state without simulating a full retry cycle.
  const id = await env.data.outbox.create(tenantId, {
    tenant_id: tenantId,
    event_type: "hook.post-user-registration",
    log_type: "sapi",
    category: "system",
    actor: { type: "system" },
    target: { type: "user", id: "email|userId" },
    request: { method: "POST", path: "/users", ip: "127.0.0.1" },
    hostname: "localhost",
    timestamp: new Date().toISOString(),
  });
  await env.data.outbox.deadLetter(id, "webhook h1 returned 500");
  return id;
}

describe("management-api failed-events", () => {
  it("lists dead-lettered events for a tenant", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const id = await seedDeadLetteredEvent(env, "tenantId");

    const response = await managementClient["failed-events"].$get(
      {
        query: {},
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      events: Array<{ id: string; final_error?: string | null }>;
      length: number;
    };
    expect(body.events.length).toBe(1);
    expect(body.events[0].id).toBe(id);
    expect(body.events[0].final_error).toContain("500");
  });

  it("returns totals when include_totals is set", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    await seedDeadLetteredEvent(env, "tenantId", "evt-a");
    await seedDeadLetteredEvent(env, "tenantId", "evt-b");

    const response = await managementClient["failed-events"].$get(
      {
        query: { include_totals: "true" },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      events: unknown[];
      length: number;
    };
    expect(body.length).toBe(2);
    expect(body.events.length).toBe(2);
  });

  it("replays a dead-lettered event back onto the queue", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const id = await seedDeadLetteredEvent(env, "tenantId");

    const retryResponse = await (managementClient["failed-events"] as any)[
      ":id"
    ].retry.$post(
      {
        param: { id },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(retryResponse.status).toBe(200);
    const retryBody = (await retryResponse.json()) as {
      id: string;
      replayed: boolean;
    };
    expect(retryBody).toEqual({ id, replayed: true });

    // Event should now be pending again — visible via getUnprocessed, and
    // no longer visible via listFailed.
    const unprocessed = await env.data.outbox.getUnprocessed(10);
    expect(unprocessed.some((e: any) => e.id === id)).toBe(true);

    const listAfter = await env.data.outbox.listFailed("tenantId", {});
    expect(listAfter.events.some((e: any) => e.id === id)).toBe(false);
  });

  it("returns 404 when replaying an unknown event id", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const retryResponse = await (managementClient["failed-events"] as any)[
      ":id"
    ].retry.$post(
      {
        param: { id: "does-not-exist" },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(retryResponse.status).toBe(404);
  });
});
