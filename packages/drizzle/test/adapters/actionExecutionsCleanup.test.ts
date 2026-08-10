import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";

// `create` stamps created_at_ts with Date.now(), so rather than backdating
// rows these tests move the cutoff to either side of "now".
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

const HOUR = 1000 * 60 * 60;

type TestData = ReturnType<typeof getTestServer>["data"];

async function setupTenant(data: TestData, id: string) {
  await data.tenants.create({
    id,
    friendly_name: "Test Tenant",
    audience: "https://example.com",
    sender_email: "login@example.com",
    sender_name: "SenderName",
  });
}

async function createExecution(data: TestData, tenant: string, id: string) {
  await data.actionExecutions.create(tenant, {
    id,
    trigger_id: "post-login",
    status: "final",
    results: [],
  });
}

describe("action executions cleanup", () => {
  it("deletes executions created before the cutoff and keeps the rest", async () => {
    const { data } = getTestServer();
    await setupTenant(data, "tenantId");
    await createExecution(data, "tenantId", "exec-1");

    expect(await data.actionExecutions.cleanup!(iso(-HOUR))).toEqual(0);
    expect(
      await data.actionExecutions.get("tenantId", "exec-1"),
    ).not.toBeNull();

    expect(await data.actionExecutions.cleanup!(iso(HOUR))).toEqual(1);
    expect(await data.actionExecutions.get("tenantId", "exec-1")).toBeNull();
  });

  it("sweeps across tenants, since retention is not tenant-scoped", async () => {
    const { data } = getTestServer();
    await setupTenant(data, "tenant1");
    await setupTenant(data, "tenant2");
    await createExecution(data, "tenant1", "exec-1");
    await createExecution(data, "tenant2", "exec-2");

    expect(await data.actionExecutions.cleanup!(iso(HOUR))).toEqual(2);
    expect(await data.actionExecutions.get("tenant1", "exec-1")).toBeNull();
    expect(await data.actionExecutions.get("tenant2", "exec-2")).toBeNull();
  });

  it("sweeps a backlog larger than one chunk", async () => {
    const { data } = getTestServer();
    await setupTenant(data, "tenantId");

    // CLEANUP_CHUNK is 500, so this spans three statements (500/500/201) and
    // catches a loop that stops after the first chunk or fails to terminate.
    const TOTAL = 1201;
    for (let i = 0; i < TOTAL; i++) {
      await createExecution(data, "tenantId", `exec-${i}`);
    }

    expect(await data.actionExecutions.cleanup!(iso(HOUR))).toEqual(TOTAL);
    expect(await data.actionExecutions.get("tenantId", "exec-0")).toBeNull();
  });

  it("rejects an unparseable cutoff instead of deleting nothing silently", async () => {
    const { data } = getTestServer();

    await expect(data.actionExecutions.cleanup!("not-a-date")).rejects.toThrow(
      "Invalid olderThan date",
    );
  });
});
