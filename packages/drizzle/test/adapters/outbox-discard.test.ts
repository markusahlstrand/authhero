import { beforeEach, describe, expect, it } from "vitest";
import {
  AuditEventInsert,
  DataAdapters,
  OutboxAdapter,
} from "@authhero/adapter-interfaces";
import { getTestServer } from "../helpers/test-server";

function makeEvent(tenantId: string): AuditEventInsert {
  return {
    tenant_id: tenantId,
    event_type: "hook.post-user-registration",
    log_type: "sapi",
    category: "system",
    actor: { type: "system" },
    target: { type: "user", id: "email|u1" },
    request: { method: "POST", path: "/", ip: "" },
    hostname: "",
    timestamp: "2026-07-09T00:00:00.000Z",
  };
}

function discard(outbox: OutboxAdapter, id: string, tenantId: string) {
  if (!outbox.discard) {
    throw new Error("drizzle outbox adapter must implement discard");
  }
  return outbox.discard(id, tenantId);
}

describe("outbox adapter — discard", () => {
  let data: DataAdapters;
  let outbox: OutboxAdapter;

  beforeEach(async () => {
    ({ data } = getTestServer());
    if (!data.outbox) throw new Error("drizzle adapter must expose outbox");
    outbox = data.outbox;
    for (const id of ["tenantId", "otherTenant"]) {
      await data.tenants.create({ id, friendly_name: id });
    }
  });

  it("deletes a dead-lettered event and returns true", async () => {
    const id = await outbox.create("tenantId", makeEvent("tenantId"));
    await outbox.deadLetter(id, "webhook returned 500");

    expect(await discard(outbox, id, "tenantId")).toBe(true);
    expect(await outbox.getByIds([id])).toHaveLength(0);
    expect((await outbox.listFailed("tenantId")).events).toHaveLength(0);
  });

  it("does not delete a pending event", async () => {
    const id = await outbox.create("tenantId", makeEvent("tenantId"));

    expect(await discard(outbox, id, "tenantId")).toBe(false);
    expect(await outbox.getByIds([id])).toHaveLength(1);
  });

  it("does not delete a processed event", async () => {
    const id = await outbox.create("tenantId", makeEvent("tenantId"));
    await outbox.markProcessed([id]);

    expect(await discard(outbox, id, "tenantId")).toBe(false);
    expect(await outbox.getByIds([id])).toHaveLength(1);
  });

  it("returns false for an unknown id", async () => {
    expect(await discard(outbox, "does-not-exist", "tenantId")).toBe(false);
  });

  it("does not delete another tenant's dead-lettered event", async () => {
    const id = await outbox.create("otherTenant", makeEvent("otherTenant"));
    await outbox.deadLetter(id, "webhook returned 500");

    expect(await discard(outbox, id, "tenantId")).toBe(false);
    expect(await outbox.getByIds([id])).toHaveLength(1);
    expect((await outbox.listFailed("otherTenant")).events).toHaveLength(1);
  });
});
