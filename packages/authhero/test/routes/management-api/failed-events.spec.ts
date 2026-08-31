import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";

async function seedDeadLetteredEvent(
  env: any,
  tenantId: string,
  eventId = "evt-dead-1",
) {
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

  it("replays an event that still carries the claim from the pass that dead-lettered it", async () => {
    // A real dead-letter comes out of a relay pass that claimed the event
    // first, and `deadLetter` does not release that claim (unlike
    // `markRetry`). A replay therefore has to clear it too, or
    // `getUnprocessed` keeps skipping the event until the lease ages out and
    // the operator's retry looks like it did nothing.
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const id = await env.data.outbox.create("tenantId", {
      tenant_id: "tenantId",
      event_type: "hook.post-user-registration",
      log_type: "sapi",
      category: "system",
      actor: { type: "system" },
      target: { type: "user", id: "email|userId" },
      request: { method: "POST", path: "/users", ip: "127.0.0.1" },
      hostname: "localhost",
      timestamp: new Date().toISOString(),
    });
    // Claim first, then dead-letter — the order a real relay pass takes. The
    // lease runs well into the future so an expiring lease can't mask a
    // regression.
    const claimed = await env.data.outbox.claimEvents(
      [id],
      "worker-1",
      5 * 60 * 1000,
    );
    expect(claimed).toContain(id);
    await env.data.outbox.deadLetter(id, "webhook h1 returned 500");

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

    const unprocessed = await env.data.outbox.getUnprocessed(10);
    expect(unprocessed.some((e: any) => e.id === id)).toBe(true);
  });

  it("refuses to replay an event that belongs to a different tenant", async () => {
    // Need a second tenant to cross-tenant probe. Seed it + an event there.
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    await env.data.tenants.create({
      id: "otherTenant",
      friendly_name: "Other Tenant",
      audience: "https://other.example.com",
      sender_email: "login@other.example.com",
      sender_name: "Other",
    });
    const otherTenantEventId = await seedDeadLetteredEvent(env, "otherTenant");

    // Call replay with tenant-id: tenantId but the other tenant's event id.
    const retryResponse = await (managementClient["failed-events"] as any)[
      ":id"
    ].retry.$post(
      {
        param: { id: otherTenantEventId },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(retryResponse.status).toBe(404);

    // Event should still be dead-lettered in its own tenant — replay rejected.
    const stillFailed = await env.data.outbox.listFailed("otherTenant", {});
    expect(
      stillFailed.events.some((e: any) => e.id === otherTenantEventId),
    ).toBe(true);
  });

  it("bulk-replays several dead-lettered events and reports unknown ids", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const first = await seedDeadLetteredEvent(env, "tenantId");
    const second = await seedDeadLetteredEvent(env, "tenantId");

    const response = await (managementClient["failed-events"] as any)[
      "bulk-retry"
    ].$post(
      {
        json: { ids: [first, "does-not-exist", second] },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      replayed: string[];
      not_found: string[];
    };
    // One unknown id must not sink the ids around it.
    expect(body.replayed.sort()).toEqual([first, second].sort());
    expect(body.not_found).toEqual(["does-not-exist"]);

    const unprocessed = await env.data.outbox.getUnprocessed(10);
    const unprocessedIds = unprocessed.map((e: any) => e.id);
    expect(unprocessedIds).toContain(first);
    expect(unprocessedIds).toContain(second);

    const listAfter = await env.data.outbox.listFailed("tenantId", {});
    expect(listAfter.events.length).toBe(0);
  });

  it("refuses to bulk-replay events belonging to a different tenant", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    await env.data.tenants.create({
      id: "otherTenant",
      friendly_name: "Other Tenant",
      audience: "https://other.example.com",
      sender_email: "login@other.example.com",
      sender_name: "Other",
    });
    const otherTenantEventId = await seedDeadLetteredEvent(env, "otherTenant");
    const ownEventId = await seedDeadLetteredEvent(env, "tenantId");

    const response = await (managementClient["failed-events"] as any)[
      "bulk-retry"
    ].$post(
      {
        json: { ids: [ownEventId, otherTenantEventId] },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      replayed: string[];
      not_found: string[];
    };
    expect(body.replayed).toEqual([ownEventId]);
    expect(body.not_found).toEqual([otherTenantEventId]);

    const stillFailed = await env.data.outbox.listFailed("otherTenant", {});
    expect(
      stillFailed.events.some((e: any) => e.id === otherTenantEventId),
    ).toBe(true);
  });

  it("gives a repeated id a single verdict", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const id = await seedDeadLetteredEvent(env, "tenantId");

    const response = await (managementClient["failed-events"] as any)[
      "bulk-retry"
    ].$post(
      {
        json: { ids: [id, id] },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      replayed: string[];
      not_found: string[];
    };
    expect(body.replayed).toEqual([id]);
    expect(body.not_found).toEqual([]);
  });

  it("rejects an empty or oversized id list", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const empty = await (managementClient["failed-events"] as any)[
      "bulk-retry"
    ].$post(
      {
        json: { ids: [] },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(empty.status).toBe(400);

    const tooMany = await (managementClient["failed-events"] as any)[
      "bulk-retry"
    ].$post(
      {
        json: { ids: Array.from({ length: 101 }, (_, i) => `evt-${i}`) },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(tooMany.status).toBe(400);
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
