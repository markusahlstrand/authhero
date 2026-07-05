import { describe, it, expect, vi } from "vitest";
import {
  runProvisionOperation,
  type ProvisionOperationDeps,
} from "../../src/workflows";
import type { TenantProvisionerSteps } from "../../src/wfp-provisioner";
import {
  fakeStepRunner,
  fakeStores,
  fakeTenants,
  replayStepRunner,
  retryingStepRunner,
} from "./helpers";

const PARAMS = {
  operation_id: "op_1",
  tenant_id: "kvartal",
  kind: "provision" as const,
};

function fakeProvisionerSteps(): TenantProvisionerSteps & {
  callLog: string[];
} {
  const callLog: string[] = [];
  return {
    callLog,
    names: (tenantId: string) => ({
      scriptName: tenantId,
      databaseName: `tenant-${tenantId}`,
    }),
    validate: () => ({
      databaseVersion: "0001.sql",
      bundleConfiguration: "authhero-drizzle-d1",
      workerVersion: "v1.2.3",
    }),
    async findOrCreateDatabase(name: string) {
      callLog.push(`findOrCreateDatabase:${name}`);
      return { id: "db_x", created: true };
    },
    async applyMigrations(databaseId: string, created: boolean) {
      callLog.push(`applyMigrations:${databaseId}:${created}`);
    },
    async uploadScript(scriptName: string, databaseId: string) {
      callLog.push(`uploadScript:${scriptName}:${databaseId}`);
    },
    async uploadSecrets(scriptName: string, tenantId: string) {
      callLog.push(`uploadSecrets:${scriptName}:${tenantId}`);
    },
    async deprovision() {
      throw new Error("not used");
    },
  };
}

async function seedOperation(stores: ReturnType<typeof fakeStores>) {
  const op = await stores.tenantOperations.create({
    tenant_id: "kvartal",
    kind: "provision",
    engine: "cloudflare-workflows",
  });
  // Align with the deterministic op id the params reference.
  stores.operations.delete(op.id);
  stores.operations.set("op_1", { ...op, id: "op_1" });
}

function baseDeps(
  overrides: Partial<ProvisionOperationDeps> = {},
): ProvisionOperationDeps & {
  stores: ReturnType<typeof fakeStores>;
  tenants: ReturnType<typeof fakeTenants>;
} {
  const stores = fakeStores();
  const tenants = fakeTenants([
    { id: "kvartal", deployment_type: "wfp", provisioning_state: "pending" },
  ]);
  return {
    steps: fakeProvisionerSteps(),
    tenants,
    stores,
    syncDefaults: vi.fn(async () => ({})),
    verify: vi.fn(async () => {}),
    ...overrides,
    // keep the concrete fakes accessible in tests
    ...({} as Record<never, never>),
  };
}

describe("runProvisionOperation", () => {
  it("runs the full step sequence and marks the tenant ready", async () => {
    const deps = baseDeps();
    await seedOperation(deps.stores);
    const step = fakeStepRunner();

    await runProvisionOperation(deps, PARAMS, step);

    expect(step.calls.map((c) => c.name)).toEqual([
      "mark-running",
      "create-database",
      "apply-migrations",
      "upload-script",
      "upload-secrets",
      "seed-defaults",
      "verify",
      "mark-ready",
    ]);

    const operation = deps.stores.operations.get("op_1");
    expect(operation?.status).toBe("succeeded");
    expect(operation?.finished_at).toBeTruthy();

    const outcomes = deps.stores.events.map((e) => `${e.step}:${e.outcome}`);
    expect(outcomes).toEqual([
      "mark-running:succeeded",
      "create-database:succeeded",
      "apply-migrations:succeeded",
      "upload-script:succeeded",
      "upload-secrets:succeeded",
      "seed-defaults:succeeded",
      "verify:succeeded",
      "mark-ready:succeeded",
    ]);

    expect(deps.tenants.store.get("kvartal")).toMatchObject({
      provisioning_state: "ready",
      d1_database_id: "db_x",
      worker_script_name: "kvartal",
      worker_version: "v1.2.3",
      database_version: "0001.sql",
    });
  });

  it("incident regression: a failing seed can never yield a ready tenant", async () => {
    const deps = baseDeps({
      syncDefaults: vi.fn(async () => ({
        connections: { errors: ["insert failed: SQLITE_ERROR"] },
      })),
    });
    await seedOperation(deps.stores);
    const step = fakeStepRunner();

    await expect(runProvisionOperation(deps, PARAMS, step)).rejects.toThrow(
      /sync-defaults seed reported 1 error/,
    );

    const tenant = deps.tenants.store.get("kvartal");
    expect(tenant?.provisioning_state).toBe("failed");
    expect(tenant?.provisioning_error).toMatch(/sync-defaults seed/);
    // Resource ids persisted for a later re-provision.
    expect(tenant?.d1_database_id).toBe("db_x");

    const operation = deps.stores.operations.get("op_1");
    expect(operation?.status).toBe("failed");
    expect(operation?.error).toMatch(/sync-defaults seed/);

    const verify = deps.verify;
    expect(verify).not.toHaveBeenCalled();
  });

  it("incident regression: a propagation race resolves via retried verify", async () => {
    let attempts = 0;
    const deps = baseDeps({
      verify: vi.fn(async () => {
        attempts++;
        if (attempts <= 2) {
          throw new Error("verification failed: 0 keys");
        }
      }),
    });
    await seedOperation(deps.stores);
    const step = retryingStepRunner();

    await runProvisionOperation(deps, PARAMS, step);

    expect(attempts).toBe(3);
    expect(deps.tenants.store.get("kvartal")?.provisioning_state).toBe("ready");
    expect(deps.stores.operations.get("op_1")?.status).toBe("succeeded");
  });

  it("fails the operation when verify exhausts its retries", async () => {
    const deps = baseDeps({
      verify: vi.fn(async () => {
        throw new Error("verification failed: 0 keys");
      }),
    });
    await seedOperation(deps.stores);
    const step = retryingStepRunner();

    await expect(runProvisionOperation(deps, PARAMS, step)).rejects.toThrow(
      /0 keys/,
    );

    const tenant = deps.tenants.store.get("kvartal");
    expect(tenant?.provisioning_state).toBe("failed");
    expect(tenant?.provisioning_error).toMatch(/0 keys/);
    expect(deps.stores.operations.get("op_1")?.status).toBe("failed");
  });

  it("replay after eviction skips completed side effects", async () => {
    const deps = baseDeps();
    await seedOperation(deps.stores);
    const memo = new Map<string, unknown>();

    // First run: dies right after upload-script (simulated by a failing
    // upload-secrets), leaving steps 1-4 memoized.
    const failingDeps = {
      ...deps,
      steps: {
        ...deps.steps,
        uploadSecrets: vi.fn(async () => {
          throw new Error("evicted");
        }),
      },
    };
    // Note: the mark-failed step also runs (and memoizes) on this first
    // pass — but a real eviction wouldn't reach it; drop it from the memo
    // to model dying mid-run.
    await expect(
      runProvisionOperation(failingDeps, PARAMS, replayStepRunner(memo)),
    ).rejects.toThrow("evicted");
    memo.delete("mark-failed");
    memo.delete("upload-secrets");

    // Reset op back to running (a real replay resumes the same instance).
    await deps.stores.tenantOperations.update("op_1", { status: "running" });

    const stepsSpy = deps.steps;
    const secondRun = replayStepRunner(memo);
    await runProvisionOperation(deps, PARAMS, secondRun);

    // Only the steps that never completed run live on replay.
    expect(secondRun.executed).toEqual([
      "upload-secrets",
      "seed-defaults",
      "verify",
      "mark-ready",
    ]);
    // The heavy side effects from steps 2-4 ran exactly once (first pass).
    expect(
      stepsSpy.callLog.filter((c) => c.startsWith("findOrCreateDatabase")),
    ).toHaveLength(1);
    expect(deps.stores.operations.get("op_1")?.status).toBe("succeeded");
  });

  it("closes the operation as skipped when the tenant is missing", async () => {
    const deps = baseDeps({ tenants: fakeTenants([]) });
    await seedOperation(deps.stores);
    const step = fakeStepRunner();

    await runProvisionOperation(deps, PARAMS, step);

    expect(step.calls.map((c) => c.name)).toEqual(["mark-running"]);
    expect(deps.stores.operations.get("op_1")?.status).toBe("succeeded");
    expect(deps.stores.events.map((e) => e.outcome)).toEqual(["skipped"]);
  });

  it("skips non-wfp tenants without touching Cloudflare", async () => {
    const deps = baseDeps({
      tenants: fakeTenants([{ id: "kvartal", deployment_type: "shared" }]),
    });
    await seedOperation(deps.stores);
    const step = fakeStepRunner();

    await runProvisionOperation(deps, PARAMS, step);

    const steps = deps.steps;
    expect(steps.callLog).toEqual([]);
    expect(deps.stores.operations.get("op_1")?.status).toBe("succeeded");
  });

  it("step outputs survive JSON serialization (engine persistence)", async () => {
    const deps = baseDeps();
    await seedOperation(deps.stores);

    const outputs: unknown[] = [];
    const step = {
      async do<T>(
        _name: string,
        configOrFn: unknown,
        maybeFn?: () => Promise<T>,
      ): Promise<T> {
        const fn =
          typeof configOrFn === "function"
            ? (configOrFn as () => Promise<T>)
            : maybeFn;
        const result = await fn!();
        outputs.push(result);
        return result;
      },
    };

    await runProvisionOperation(deps, PARAMS, step);

    for (const output of outputs) {
      if (output === undefined) continue;
      expect(JSON.parse(JSON.stringify(output))).toEqual(output);
    }
  });
});
