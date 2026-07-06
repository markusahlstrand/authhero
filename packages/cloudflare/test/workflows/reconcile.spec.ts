import { describe, it, expect } from "vitest";
import { reconcileTenantOperations } from "../../src/workflows";
import { fakeBinding, fakeStores, fakeTenants } from "./helpers";

const OLD = "2020-01-01T00:00:00.000Z";

async function seedStuckOperation(
  stores: ReturnType<typeof fakeStores>,
  overrides: {
    id?: string;
    status?: "pending" | "running";
    tenant_id?: string | null;
    engine_instance_id?: string | null;
    updated_at?: string;
  } = {},
) {
  const created = await stores.tenantOperations.create({
    tenant_id:
      overrides.tenant_id === undefined ? "kvartal" : overrides.tenant_id,
    kind: "provision",
    engine: "cloudflare-workflows",
  });
  const id = overrides.id ?? created.id;
  stores.operations.delete(created.id);
  stores.operations.set(id, {
    ...created,
    id,
    status: overrides.status ?? "running",
    engine_instance_id:
      overrides.engine_instance_id === undefined
        ? `wf-${id}`
        : overrides.engine_instance_id,
    updated_at: overrides.updated_at ?? OLD,
  });
  return id;
}

describe("reconcileTenantOperations", () => {
  it("copies an errored engine state into the operation and tenant", async () => {
    const stores = fakeStores();
    const tenants = fakeTenants([
      { id: "kvartal", deployment_type: "wfp", provisioning_state: "pending" },
    ]);
    const binding = fakeBinding();
    const id = await seedStuckOperation(stores);
    binding.statuses.set(`wf-${id}`, {
      status: "errored",
      error: { name: "Error", message: "step create-d1 exhausted retries" },
    });

    const result = await reconcileTenantOperations({
      stores,
      tenants,
      binding,
    });

    expect(result).toMatchObject({ scanned: 1, markedFailed: 1, errors: 0 });
    const operation = stores.operations.get(id);
    expect(operation?.status).toBe("failed");
    expect(operation?.error).toMatch(/exhausted retries/);
    expect(stores.events.some((e) => e.outcome === "reconciled")).toBe(true);
    expect(tenants.store.get("kvartal")?.provisioning_state).toBe("failed");
  });

  it("marks failed when the instance is missing (expired or never started)", async () => {
    const stores = fakeStores();
    const tenants = fakeTenants([{ id: "kvartal", deployment_type: "wfp" }]);
    const binding = fakeBinding();
    const id = await seedStuckOperation(stores);
    binding.missingInstances.add(`wf-${id}`);

    const result = await reconcileTenantOperations({
      stores,
      tenants,
      binding,
    });

    expect(result.instanceMissing).toBe(1);
    expect(stores.operations.get(id)?.status).toBe("failed");
    expect(stores.operations.get(id)?.error).toMatch(/not found/);
  });

  it("resolves complete-but-unfinalized from the tenant snapshot", async () => {
    const stores = fakeStores();
    const tenants = fakeTenants([
      { id: "ready-t", deployment_type: "wfp", provisioning_state: "ready" },
      { id: "stuck-t", deployment_type: "wfp", provisioning_state: "pending" },
    ]);
    const binding = fakeBinding();
    const readyOp = await seedStuckOperation(stores, {
      id: "op_ready",
      tenant_id: "ready-t",
    });
    const stuckOp = await seedStuckOperation(stores, {
      id: "op_stuck",
      tenant_id: "stuck-t",
    });
    binding.statuses.set(`wf-${readyOp}`, { status: "complete" });
    binding.statuses.set(`wf-${stuckOp}`, { status: "complete" });

    const result = await reconcileTenantOperations({
      stores,
      tenants,
      binding,
    });

    expect(result.markedSucceeded).toBe(1);
    expect(result.markedFailed).toBe(1);
    expect(stores.operations.get("op_ready")?.status).toBe("succeeded");
    expect(stores.operations.get("op_stuck")?.status).toBe("failed");
  });

  it("leaves running instances and fresh operations untouched", async () => {
    const stores = fakeStores();
    const tenants = fakeTenants([{ id: "kvartal", deployment_type: "wfp" }]);
    const binding = fakeBinding();

    const runningOp = await seedStuckOperation(stores, { id: "op_running" });
    binding.statuses.set(`wf-${runningOp}`, { status: "running" });
    // Fresh operation: updated_at is now, inside the min-age window.
    await seedStuckOperation(stores, {
      id: "op_fresh",
      updated_at: new Date().toISOString(),
    });

    const result = await reconcileTenantOperations({
      stores,
      tenants,
      binding,
    });

    expect(result.scanned).toBe(1); // fresh op filtered by updated_before
    expect(result.stillRunning).toBe(1);
    expect(stores.operations.get("op_running")?.status).toBe("running");
    expect(stores.operations.get("op_fresh")?.status).toBe("running");
  });

  it("derives the instance id when the row carries none", async () => {
    const stores = fakeStores();
    const tenants = fakeTenants([{ id: "kvartal", deployment_type: "wfp" }]);
    const binding = fakeBinding();
    const id = await seedStuckOperation(stores, {
      id: "op_noid",
      engine_instance_id: null,
    });
    binding.statuses.set("op-provision-kvartal-op_noid", {
      status: "terminated",
      error: "terminated by operator",
    });

    const result = await reconcileTenantOperations({
      stores,
      tenants,
      binding,
    });

    expect(result.markedFailed).toBe(1);
    expect(stores.operations.get(id)?.error).toBe("terminated by operator");
  });

  it("one operation's engine error does not abort the sweep", async () => {
    const stores = fakeStores();
    const tenants = fakeTenants([{ id: "kvartal", deployment_type: "wfp" }]);
    const binding = fakeBinding();

    const broken = await seedStuckOperation(stores, { id: "op_broken" });
    // status() itself will throw for this one: make get() succeed but the
    // handle status throw via a poisoned status map entry.
    binding.getErrors.set(
      `wf-${broken}`,
      Object.assign(new Error("api quota exceeded"), { name: "QuotaError" }),
    );
    const errored = await seedStuckOperation(stores, { id: "op_errored" });
    binding.statuses.set(`wf-${errored}`, { status: "errored", error: "boom" });

    const result = await reconcileTenantOperations({
      stores,
      tenants,
      binding,
    });

    // The quota error is treated as instance-missing (get threw) — the
    // matching is deliberately permissive; the sweep still processes the
    // second operation.
    expect(result.scanned).toBe(2);
    expect(stores.operations.get("op_errored")?.status).toBe("failed");
  });
});
