import { describe, it, expect, beforeEach } from "vitest";
import createAdapters from "@authhero/kysely-adapter";
import { createMigratedDb } from "./helpers/migrated-db";
import {
  buildEngineInstanceId,
  createInlineExecutor,
  enqueueTenantOperation,
  runRecordedTenantOperation,
  TenantOperationStores,
} from "../src/operations";
import { createProvisioningHooks } from "../src/hooks";

describe("buildEngineInstanceId", () => {
  it("builds a deterministic dash-separated id", () => {
    const id = buildEngineInstanceId({
      kind: "provision",
      tenant_id: "tenant-a",
      id: "op_abc123",
    });
    expect(id).toBe("op-provision-tenant-a-op_abc123");
  });

  it("sanitizes characters outside [a-zA-Z0-9_-]", () => {
    const id = buildEngineInstanceId({
      kind: "provision",
      tenant_id: "tenant:with spaces/slashes",
      id: "op_abc",
    });
    expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it("uses a fleet segment for null tenant ids", () => {
    const id = buildEngineInstanceId({
      kind: "backup",
      tenant_id: null,
      id: "op_abc",
    });
    expect(id).toBe("op-backup-fleet-op_abc");
  });

  it("truncates the tenant segment, never the operation id", () => {
    const id = buildEngineInstanceId({
      kind: "provision",
      tenant_id: "x".repeat(200),
      id: "op_abcdefghij123456789",
    });
    expect(id.length).toBeLessThanOrEqual(64);
    expect(id.endsWith("-op_abcdefghij123456789")).toBe(true);
  });
});

describe("inline executor + enqueue", () => {
  let stores: TenantOperationStores;

  beforeEach(async () => {
    const db = await createMigratedDb();
    const adapters = createAdapters(db);
    stores = {
      tenantOperations: adapters.tenantOperations!,
      tenantOperationEvents: adapters.tenantOperationEvents!,
    };
  });

  it("runs steps to succeeded, recording an event trail", async () => {
    const calls: string[] = [];
    const executor = createInlineExecutor({
      stores,
      definitions: {
        upgrade: () => [
          {
            name: "snapshot",
            async run() {
              calls.push("snapshot");
              return { bookmark: "bm-1" };
            },
          },
          {
            name: "apply",
            async run() {
              calls.push("apply");
            },
          },
        ],
      },
    });

    const operation = await enqueueTenantOperation(stores, executor, {
      kind: "upgrade",
      tenant_id: "tenant-a",
      initiated_by: "auth0|admin",
    });

    expect(calls).toEqual(["snapshot", "apply"]);
    expect(operation.status).toBe("succeeded");
    expect(operation.engine).toBe("inline");
    expect(operation.engine_instance_id).toContain("op-upgrade-tenant-a-");
    expect(operation.finished_at).toBeTruthy();

    const { events } = await stores.tenantOperationEvents.listByOperation(
      operation.id,
    );
    expect(events.map((e) => `${e.step}:${e.outcome}`)).toEqual([
      "snapshot:started",
      "snapshot:succeeded",
      "apply:started",
      "apply:succeeded",
    ]);
    expect(events[1]!.detail).toEqual({ bookmark: "bm-1" });
  });

  it("marks the operation failed and rethrows when a step throws", async () => {
    const executor = createInlineExecutor({
      stores,
      definitions: {
        upgrade: () => [
          {
            name: "explode",
            async run() {
              throw new Error("boom");
            },
          },
        ],
      },
    });

    await expect(
      enqueueTenantOperation(stores, executor, {
        kind: "upgrade",
        tenant_id: "tenant-a",
      }),
    ).rejects.toThrow("boom");

    const { operations } = await stores.tenantOperations.list({
      tenant_id: "tenant-a",
    });
    expect(operations).toHaveLength(1);
    expect(operations[0]!.status).toBe("failed");
    expect(operations[0]!.error).toBe("boom");
    expect(operations[0]!.finished_at).toBeTruthy();

    const { events } = await stores.tenantOperationEvents.listByOperation(
      operations[0]!.id,
    );
    expect(events.map((e) => `${e.step}:${e.outcome}`)).toEqual([
      "explode:started",
      "explode:failed",
    ]);
  });

  it("fails cleanly for an unknown kind", async () => {
    const executor = createInlineExecutor({ stores, definitions: {} });

    await expect(
      enqueueTenantOperation(stores, executor, {
        kind: "seed",
        tenant_id: "tenant-a",
      }),
    ).rejects.toThrow(/no inline operation definition/i);

    const { operations } = await stores.tenantOperations.list({
      tenant_id: "tenant-a",
    });
    expect(operations[0]!.status).toBe("failed");
  });
});

describe("runRecordedTenantOperation", () => {
  it("records reported steps and finalizes succeeded", async () => {
    const db = await createMigratedDb();
    const adapters = createAdapters(db);

    await runRecordedTenantOperation(
      adapters,
      { kind: "provision", tenant_id: "tenant-a", initiated_by: "auth0|admin" },
      async (report) => {
        expect(report).toBeDefined();
        await report!("provision-resources", "started");
        await report!("provision-resources", "succeeded", {
          d1_database_id: "d1-1",
        });
        await report!("seed-defaults", "started");
        await report!("seed-defaults", "succeeded");
      },
    );

    const { operations } = await adapters.tenantOperations!.list({
      tenant_id: "tenant-a",
    });
    expect(operations).toHaveLength(1);
    const op = operations[0]!;
    expect(op.status).toBe("succeeded");
    expect(op.kind).toBe("provision");
    expect(op.initiated_by).toBe("auth0|admin");
    expect(op.engine).toBe("inline");
    expect(op.current_step).toBe("seed-defaults");

    const { events } = await adapters.tenantOperationEvents!.listByOperation(
      op.id,
    );
    expect(events.map((e) => `${e.step}:${e.outcome}`)).toEqual([
      "provision-resources:started",
      "provision-resources:succeeded",
      "seed-defaults:started",
      "seed-defaults:succeeded",
    ]);
    expect(events[1]!.detail).toEqual({ d1_database_id: "d1-1" });
  });

  it("records a single coarse step when the reporter is never called", async () => {
    const db = await createMigratedDb();
    const adapters = createAdapters(db);

    await runRecordedTenantOperation(
      adapters,
      { kind: "provision", tenant_id: "tenant-b" },
      async () => {
        /* legacy onProvision that ignores the reporter */
      },
    );

    const { operations } = await adapters.tenantOperations!.list({
      tenant_id: "tenant-b",
    });
    expect(operations[0]!.status).toBe("succeeded");

    const { events } = await adapters.tenantOperationEvents!.listByOperation(
      operations[0]!.id,
    );
    expect(events.map((e) => `${e.step}:${e.outcome}`)).toEqual([
      "provision:succeeded",
    ]);
  });

  it("marks failed and rethrows when the work throws", async () => {
    const db = await createMigratedDb();
    const adapters = createAdapters(db);

    await expect(
      runRecordedTenantOperation(
        adapters,
        { kind: "provision", tenant_id: "tenant-c" },
        async () => {
          throw new Error("provision blew up");
        },
      ),
    ).rejects.toThrow("provision blew up");

    const { operations } = await adapters.tenantOperations!.list({
      tenant_id: "tenant-c",
    });
    expect(operations[0]!.status).toBe("failed");
    expect(operations[0]!.error).toBe("provision blew up");
  });

  it("runs the work unrecorded when the adapters are absent", async () => {
    const db = await createMigratedDb();
    const adapters = createAdapters(db);
    const withoutOperations = {
      ...adapters,
      tenantOperations: undefined,
      tenantOperationEvents: undefined,
    };

    let ran = false;
    let receivedReporter: unknown = "sentinel";
    await runRecordedTenantOperation(
      withoutOperations,
      { kind: "provision", tenant_id: "tenant-d" },
      async (report) => {
        ran = true;
        receivedReporter = report;
      },
    );

    expect(ran).toBe(true);
    expect(receivedReporter).toBeUndefined();
    // No rows were written anywhere
    const { operations } = await adapters.tenantOperations!.list({});
    expect(operations).toHaveLength(0);
  });
});

describe("provisioning hook recording", () => {
  it("records a provision operation from afterCreate", async () => {
    const db = await createMigratedDb();
    const adapters = createAdapters(db);

    const provisioned: string[] = [];
    const hooks = createProvisioningHooks({
      databaseIsolation: {
        getAdapters: async () => adapters,
        onProvision: async (tenantId, report) => {
          provisioned.push(tenantId);
          await report?.("provision-resources", "started");
          await report?.("provision-resources", "succeeded");
        },
      },
    });

    const tenant = await adapters.tenants.create({
      id: "wfp-tenant",
      friendly_name: "WFP Tenant",
    });
    await hooks.afterCreate!({ adapters }, tenant);

    expect(provisioned).toEqual(["wfp-tenant"]);

    const { operations } = await adapters.tenantOperations!.list({
      tenant_id: "wfp-tenant",
    });
    expect(operations).toHaveLength(1);
    expect(operations[0]!.kind).toBe("provision");
    expect(operations[0]!.status).toBe("succeeded");
  });

  it("marks the operation failed and propagates a provision error", async () => {
    const db = await createMigratedDb();
    const adapters = createAdapters(db);

    const hooks = createProvisioningHooks({
      databaseIsolation: {
        getAdapters: async () => adapters,
        onProvision: async () => {
          throw new Error("no capacity");
        },
      },
    });

    const tenant = await adapters.tenants.create({
      id: "wfp-tenant-2",
      friendly_name: "WFP Tenant 2",
    });

    await expect(hooks.afterCreate!({ adapters }, tenant)).rejects.toThrow(
      "no capacity",
    );

    const { operations } = await adapters.tenantOperations!.list({
      tenant_id: "wfp-tenant-2",
    });
    expect(operations[0]!.status).toBe("failed");
    expect(operations[0]!.error).toBe("no capacity");
  });
});
