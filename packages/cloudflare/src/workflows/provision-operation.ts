import type { TenantsDataAdapter } from "@authhero/adapter-interfaces";
import {
  createOperationRecorder,
  type StepConfig,
  type StepRunner,
  type TenantOperationStores,
} from "@authhero/multi-tenancy";
import type { TenantProvisionerSteps } from "../wfp-provisioner/provisioner-steps";
import { collectSyncDefaultsErrors } from "../wfp-provisioner/sync-defaults-errors";
import type { TenantOperationWorkflowParams } from "./types";

export type ProvisionStepName =
  | "mark-running"
  | "create-database"
  | "apply-migrations"
  | "upload-script"
  | "upload-secrets"
  | "seed-defaults"
  | "verify"
  | "mark-ready"
  | "mark-failed";

export interface ProvisionOperationDeps {
  /** Provider-agnostic provisioner steps (all idempotent) — e.g.
   * `createWfpProvisionerSteps` for Cloudflare WFP + D1. */
  steps: TenantProvisionerSteps;
  /** Control-plane tenants adapter (snapshot writes). */
  tenants: TenantsDataAdapter;
  /** Control-plane operation log stores. */
  stores: TenantOperationStores;
  /**
   * Defaults seed (`createDispatchSyncDefaults(...)`). Runs as a retried
   * step BEFORE `ready`; per-entity errors in the resolved result fail the
   * step. Optional only for parity with the inline hook — WFP control
   * planes should always set it.
   */
  syncDefaults?: (tenantId: string) => Promise<unknown>;
  /**
   * Post-seed verification (`createProvisionVerifier(...)`). Throws until
   * the tenant database actually holds keys + the tenant row; retried with backoff so a
   * propagation race becomes a few retries instead of a bad `ready`.
   */
  verify?: (databaseId: string, tenantId: string) => Promise<void>;
  /** Same gate + default as the inline hook: `deployment_type === "wfp"`. */
  shouldProvision?: (tenant: {
    id: string;
    deployment_type?: string;
    storage_kind?: string;
  }) => boolean;
  logger?: Pick<Console, "warn">;
  /** Per-step overrides of the retry/timeout defaults. */
  stepConfig?: Partial<Record<ProvisionStepName, StepConfig>>;
}

const DEFAULT_STEP_CONFIG: StepConfig = {
  retries: { limit: 5, delay: "5 seconds", backoff: "exponential" },
  timeout: "2 minutes",
};

// The verify step retries longer with wider gaps: it exists to absorb
// propagation races between the seed landing and the data being readable.
const DEFAULT_VERIFY_CONFIG: StepConfig = {
  retries: { limit: 8, delay: "10 seconds", backoff: "exponential" },
  timeout: "1 minute",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Durable provision-as-workflow (issue #1026 phase 2): the full provision
 * sequence — resources, migrations, script, secrets, seed, verify — as one
 * engine step per unit, writing back to the control-plane operation log at
 * every step boundary. The DB write happens inside the same `step.do` as
 * the side effect, so it is durable and retried with the step; all side
 * effects are idempotent, which makes replay after a retry or eviction
 * safe.
 *
 * Terminal writes: `mark-ready` flips the tenant snapshot to `ready` and
 * the operation to `succeeded`; any failure runs `mark-failed` (persisting
 * whatever resource ids exist, mirroring the inline hook's failed branch)
 * and rethrows so the engine instance ends `errored`. If even `mark-failed`
 * dies, the operation stays `running` and the reconciler sweep copies the
 * engine's terminal state into the DB.
 *
 * Runs against any `StepRunner` — Cloudflare's `WorkflowStep` satisfies it
 * structurally, and tests use fakes.
 */
export async function runProvisionOperation(
  deps: ProvisionOperationDeps,
  params: TenantOperationWorkflowParams,
  step: StepRunner,
): Promise<void> {
  const recorder = createOperationRecorder(deps.stores);
  const shouldProvision =
    deps.shouldProvision ??
    ((tenant: { deployment_type?: string }) =>
      tenant.deployment_type === "wfp");

  const config = (name: ProvisionStepName): StepConfig =>
    deps.stepConfig?.[name] ??
    (name === "verify" ? DEFAULT_VERIFY_CONFIG : DEFAULT_STEP_CONFIG);

  const operationId = params.operation_id;
  const tenantId = params.tenant_id;

  // 1. mark-running — load + gate the tenant, validate config, flip the
  // operation to running. A missing/non-wfp tenant is a benign race with a
  // tenant rollback: close the operation as skipped without failing the
  // engine instance.
  const started = await step.do(
    "mark-running",
    config("mark-running"),
    async (): Promise<{
      skipped: boolean;
      scriptName: string;
      databaseName: string;
      databaseVersion?: string;
      bundleConfiguration?: string;
      workerVersion?: string;
    }> => {
      const tenant = await deps.tenants.get(tenantId);
      if (!tenant || !shouldProvision(tenant)) {
        await recorder.appendEvent(operationId, {
          step: "mark-running",
          outcome: "skipped",
          detail: {
            reason: tenant
              ? "tenant is not WFP-provisioned"
              : "tenant row missing (rolled back?)",
          },
        });
        await recorder.markSucceeded(operationId);
        return { skipped: true, scriptName: "", databaseName: "" };
      }

      // Config validation runs here so an oversize migration name fails the
      // run BEFORE any Cloudflare side effects.
      const versions = deps.steps.validate();
      const names = deps.steps.names(tenantId);

      await recorder.markRunning(operationId, "mark-running");
      await recorder.appendEvent(operationId, {
        step: "mark-running",
        outcome: "succeeded",
      });
      return { skipped: false, ...names, ...versions };
    },
  );

  if (started.skipped) return;

  const resourceIds: {
    d1_database_id?: string;
    worker_script_name: string;
    bundle_configuration?: string;
    worker_version?: string;
    database_version?: string;
  } = {
    worker_script_name: started.scriptName,
    bundle_configuration: started.bundleConfiguration,
    worker_version: started.workerVersion,
    database_version: started.databaseVersion,
  };

  try {
    // 2. create-database
    const database = await step.do(
      "create-database",
      config("create-database"),
      async (): Promise<{ databaseId: string; created: boolean }> => {
        await recorder.setCurrentStep(operationId, "create-database");
        const { id, created } = await deps.steps.findOrCreateDatabase(
          started.databaseName,
        );
        await recorder.appendEvent(operationId, {
          step: "create-database",
          outcome: "succeeded",
          detail: { database_id: id, created },
        });
        return { databaseId: id, created };
      },
    );
    resourceIds.d1_database_id = database.databaseId;

    // 3. apply-migrations — tracking-table reconcile; `created` comes from
    // step 2's memoized result, so the pair stays consistent on replay.
    await step.do("apply-migrations", config("apply-migrations"), async () => {
      await recorder.setCurrentStep(operationId, "apply-migrations");
      await deps.steps.applyMigrations(database.databaseId, database.created);
      await recorder.appendEvent(operationId, {
        step: "apply-migrations",
        outcome: "succeeded",
        detail: { database_version: started.databaseVersion },
      });
    });

    // 4. upload-script
    await step.do("upload-script", config("upload-script"), async () => {
      await recorder.setCurrentStep(operationId, "upload-script");
      await deps.steps.uploadScript(started.scriptName, database.databaseId);
      await recorder.appendEvent(operationId, {
        step: "upload-script",
        outcome: "succeeded",
        detail: { worker_version: started.workerVersion },
      });
    });

    // 5. upload-secrets — secrets are resolved inside the step from deps
    // (built from worker env); they never appear in params or step output.
    await step.do("upload-secrets", config("upload-secrets"), async () => {
      await recorder.setCurrentStep(operationId, "upload-secrets");
      await deps.steps.uploadSecrets(started.scriptName, tenantId);
      await recorder.appendEvent(operationId, {
        step: "upload-secrets",
        outcome: "succeeded",
      });
    });

    // 6. seed-defaults — the incident fix, part 1: the seed is a durable,
    // retried step whose failure fails the operation, not a console.error.
    if (deps.syncDefaults) {
      const syncDefaults = deps.syncDefaults;
      await step.do("seed-defaults", config("seed-defaults"), async () => {
        await recorder.setCurrentStep(operationId, "seed-defaults");
        const result = await syncDefaults(tenantId);
        const seedErrors = collectSyncDefaultsErrors(result);
        if (seedErrors.length > 0) {
          throw new Error(
            `sync-defaults seed reported ${seedErrors.length} error(s): ${seedErrors.join("; ")}`,
          );
        }
        await recorder.appendEvent(operationId, {
          step: "seed-defaults",
          outcome: "succeeded",
        });
      });
    }

    // 7. verify — the incident fix, part 2: "ready over an empty database" is
    // impossible because this step throws (and retries) until the data is
    // actually there.
    if (deps.verify) {
      const verify = deps.verify;
      await step.do("verify", config("verify"), async () => {
        await recorder.setCurrentStep(operationId, "verify");
        await verify(database.databaseId, tenantId);
        await recorder.appendEvent(operationId, {
          step: "verify",
          outcome: "succeeded",
        });
      });
    }

    // 8. mark-ready — both terminal writes in one step: the tenant snapshot
    // and the operation row.
    await step.do("mark-ready", config("mark-ready"), async () => {
      await recorder.setCurrentStep(operationId, "mark-ready");
      await deps.tenants.update(tenantId, {
        ...resourceIds,
        provisioning_state: "ready",
        provisioning_error: undefined,
        provisioning_state_changed_at: new Date().toISOString(),
      });
      await recorder.appendEvent(operationId, {
        step: "mark-ready",
        outcome: "succeeded",
      });
      await recorder.markSucceeded(operationId);
    });
  } catch (error) {
    // Terminal failure path: persist whatever resource ids exist (so a
    // re-provision can find them — mirrors the inline hook), mark the
    // tenant + operation failed, then rethrow so the instance ends
    // `errored`. If this step itself dies, the reconciler takes over.
    await step.do("mark-failed", config("mark-failed"), async () => {
      const message = errorMessage(error);
      try {
        await deps.tenants.update(tenantId, {
          ...resourceIds,
          provisioning_state: "failed",
          provisioning_error: message.slice(0, 2048),
          provisioning_state_changed_at: new Date().toISOString(),
        });
      } catch (writeErr) {
        deps.logger?.warn(
          `Failed to write provisioning_state="failed" for tenant ${tenantId}:`,
          writeErr,
        );
      }
      await recorder.appendEvent(operationId, {
        step: "mark-failed",
        outcome: "failed",
        detail: { message },
      });
      await recorder.markFailed(operationId, error);
    });
    throw error;
  }
}
