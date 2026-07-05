import { describe, it, expect } from "vitest";
import { getTestServer } from "./helpers/test-server";

describe("TenantOperationsAdapter", () => {
  it("creates an operation with defaults and reads it back", async () => {
    const { data } = await getTestServer();
    const adapter = data.tenantOperations!;
    expect(adapter).toBeDefined();

    const created = await adapter.create({
      tenant_id: "tenant-a",
      kind: "provision",
      engine: "inline",
      initiated_by: "auth0|admin",
    });

    expect(created.id.startsWith("op_")).toBe(true);
    expect(created.status).toBe("pending");
    expect(created.tenant_id).toBe("tenant-a");
    expect(created.kind).toBe("provision");
    expect(created.engine).toBe("inline");
    expect(created.created_at).toBeTypeOf("string");
    expect(created.updated_at).toBeTypeOf("string");
    expect(created.finished_at).toBeNull();

    const fetched = await adapter.get(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.status).toBe("pending");
  });

  it("supports fleet-level operations with a null tenant_id", async () => {
    const { data } = await getTestServer();
    const adapter = data.tenantOperations!;

    const created = await adapter.create({
      tenant_id: null,
      kind: "backup",
      engine: "cloudflare-workflows",
    });

    expect(created.tenant_id).toBeNull();

    const fetched = await adapter.get(created.id);
    expect(fetched!.tenant_id).toBeNull();
  });

  it("updates status fields and bumps updated_at", async () => {
    const { data } = await getTestServer();
    const adapter = data.tenantOperations!;

    const created = await adapter.create({
      tenant_id: "tenant-a",
      kind: "upgrade",
      engine: "inline",
    });

    // Ensure a measurable updated_at change
    await new Promise((resolve) => setTimeout(resolve, 5));

    const updated = await adapter.update(created.id, {
      status: "running",
      current_step: "apply-migrations",
      engine_instance_id: "op-upgrade-tenant-a-abc",
    });
    expect(updated).toBe(true);

    const fetched = await adapter.get(created.id);
    expect(fetched!.status).toBe("running");
    expect(fetched!.current_step).toBe("apply-migrations");
    expect(fetched!.engine_instance_id).toBe("op-upgrade-tenant-a-abc");
    expect(fetched!.updated_at > created.updated_at).toBe(true);

    const finished_at = new Date().toISOString();
    await adapter.update(created.id, {
      status: "failed",
      error: "boom",
      finished_at,
    });
    const failed = await adapter.get(created.id);
    expect(failed!.status).toBe("failed");
    expect(failed!.error).toBe("boom");
    expect(failed!.finished_at).toBe(finished_at);

    expect(await adapter.update("op_missing", { status: "running" })).toBe(
      false,
    );
  });

  it("lists with filters, status arrays, updated_before, and pagination", async () => {
    const { data } = await getTestServer();
    const adapter = data.tenantOperations!;

    const opA = await adapter.create({
      tenant_id: "tenant-a",
      kind: "provision",
      engine: "inline",
    });
    const opB = await adapter.create({
      tenant_id: "tenant-b",
      kind: "upgrade",
      engine: "cloudflare-workflows",
    });
    await adapter.update(opB.id, { status: "running" });
    const opC = await adapter.create({
      tenant_id: "tenant-b",
      kind: "upgrade",
      engine: "cloudflare-workflows",
      rollout_id: "rol_1",
    });
    await adapter.update(opC.id, { status: "succeeded" });

    const all = await adapter.list();
    expect(all.operations).toHaveLength(3);
    expect(all.start).toBe(0);

    const byTenant = await adapter.list({ tenant_id: "tenant-b" });
    expect(byTenant.operations).toHaveLength(2);

    const byKind = await adapter.list({ kind: "provision" });
    expect(byKind.operations).toHaveLength(1);
    expect(byKind.operations[0]!.id).toBe(opA.id);

    const byStatuses = await adapter.list({
      status: ["pending", "running"],
    });
    expect(byStatuses.operations.map((o) => o.id).sort()).toEqual(
      [opA.id, opB.id].sort(),
    );

    const byEngine = await adapter.list({ engine: "cloudflare-workflows" });
    expect(byEngine.operations).toHaveLength(2);

    const byRollout = await adapter.list({ rollout_id: "rol_1" });
    expect(byRollout.operations).toHaveLength(1);
    expect(byRollout.operations[0]!.id).toBe(opC.id);

    const future = new Date(Date.now() + 60_000).toISOString();
    const stuck = await adapter.list({
      status: ["pending", "running"],
      updated_before: future,
    });
    expect(stuck.operations).toHaveLength(2);
    const none = await adapter.list({
      updated_before: "2000-01-01T00:00:00.000Z",
    });
    expect(none.operations).toHaveLength(0);

    const page = await adapter.list({ page: 1, per_page: 2 });
    expect(page.start).toBe(2);
    expect(page.limit).toBe(2);
    expect(page.operations).toHaveLength(1);
  });

  it("removes an operation", async () => {
    const { data } = await getTestServer();
    const adapter = data.tenantOperations!;

    const created = await adapter.create({
      tenant_id: "tenant-a",
      kind: "seed",
      engine: "inline",
    });

    expect(await adapter.remove(created.id)).toBe(true);
    expect(await adapter.get(created.id)).toBeNull();
    expect(await adapter.remove(created.id)).toBe(false);
  });
});

describe("TenantOperationEventsAdapter", () => {
  it("appends events and lists them in created_at order with JSON detail", async () => {
    const { data } = await getTestServer();
    const operations = data.tenantOperations!;
    const events = data.tenantOperationEvents!;

    const op = await operations.create({
      tenant_id: "tenant-a",
      kind: "provision",
      engine: "inline",
    });

    const first = await events.create({
      operation_id: op.id,
      step: "provision-resources",
      outcome: "started",
    });
    expect(first.id.startsWith("evt_")).toBe(true);
    expect(first.attempt).toBe(1);

    await events.create({
      operation_id: op.id,
      step: "provision-resources",
      outcome: "succeeded",
      detail: { d1_database_id: "d1-123", worker_version: "v1.2.3" },
      attempt: 2,
    });

    const listed = await events.listByOperation(op.id);
    expect(listed.events).toHaveLength(2);
    expect(listed.events[0]!.outcome).toBe("started");
    expect(listed.events[1]!.outcome).toBe("succeeded");
    expect(listed.events[1]!.attempt).toBe(2);
    expect(listed.events[1]!.detail).toEqual({
      d1_database_id: "d1-123",
      worker_version: "v1.2.3",
    });

    const other = await events.listByOperation("op_other");
    expect(other.events).toHaveLength(0);
  });
});

describe("RolloutsAdapter", () => {
  it("creates, lists, updates, and removes rollouts with JSON round-trips", async () => {
    const { data } = await getTestServer();
    const adapter = data.rollouts!;
    expect(adapter).toBeDefined();

    const created = await adapter.create({
      kind: "upgrade",
      target_worker_version: "v2.0.0",
      wave_size: 25,
      canary_tenant_ids: ["tenant-a", "tenant-b"],
      filter: { deployment_type: "wfp" },
      initiated_by: "auth0|admin",
    });

    expect(created.id.startsWith("rol_")).toBe(true);
    expect(created.status).toBe("pending");
    expect(created.wave_size).toBe(25);
    expect(created.canary_tenant_ids).toEqual(["tenant-a", "tenant-b"]);
    expect(created.filter).toEqual({ deployment_type: "wfp" });

    const fetched = await adapter.get(created.id);
    expect(fetched!.canary_tenant_ids).toEqual(["tenant-a", "tenant-b"]);
    expect(fetched!.filter).toEqual({ deployment_type: "wfp" });

    const listed = await adapter.list();
    expect(listed.rollouts).toHaveLength(1);

    const updated = await adapter.update(created.id, {
      status: "canary",
      canary_tenant_ids: ["tenant-c"],
    });
    expect(updated).toBe(true);
    const afterUpdate = await adapter.get(created.id);
    expect(afterUpdate!.status).toBe("canary");
    expect(afterUpdate!.canary_tenant_ids).toEqual(["tenant-c"]);

    expect(await adapter.remove(created.id)).toBe(true);
    expect(await adapter.get(created.id)).toBeNull();
  });

  it("applies the default wave_size", async () => {
    const { data } = await getTestServer();
    const adapter = data.rollouts!;

    const created = await adapter.create({ kind: "reseed" });
    expect(created.wave_size).toBe(10);
    expect(created.canary_tenant_ids).toBeNull();
    expect(created.filter).toBeNull();
  });
});
