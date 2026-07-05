import type {
  TenantOperation,
  TenantsDataAdapter,
} from "@authhero/adapter-interfaces";
import {
  buildEngineInstanceId,
  createOperationRecorder,
  isTerminalStatus,
  type TenantOperationStores,
} from "@authhero/multi-tenancy";
import { TENANT_OPERATION_ENGINE, type WorkflowsBinding } from "./types";

export interface ReconcileTenantOperationsOptions {
  stores: TenantOperationStores;
  tenants: TenantsDataAdapter;
  binding: WorkflowsBinding;
  /**
   * Only touch operations whose `updated_at` is older than this — fresh
   * runs write at every step boundary, so a recently-updated operation is
   * alive. Default 10 minutes.
   */
  minAgeMs?: number;
  /** Max stuck operations per sweep. Default 100. */
  limit?: number;
  logger?: Pick<Console, "warn">;
}

export interface ReconcileTenantOperationsResult {
  scanned: number;
  markedFailed: number;
  markedSucceeded: number;
  stillRunning: number;
  instanceMissing: number;
  errors: number;
}

/**
 * Sweep for operations stuck in `pending`/`running` whose engine instance
 * died before reaching its own terminal write (issue #1026): resolve the
 * instance (via the stored — or re-derived, it's deterministic — id), and
 * copy terminal engine states into the control-plane DB.
 *
 * The engine retains completed-instance state for at most 30 days, so
 * hosts must run this at least daily; every 15–60 minutes is recommended
 * (wire it to the worker's `scheduled` handler). One operation's engine
 * error never aborts the sweep.
 *
 * Decision table per stuck operation:
 * - handle lookup throws (expired / never created) → `failed`
 * - engine `errored` / `terminated` → `failed` (engine error copied)
 * - engine `complete` but operation non-terminal (the final write raced or
 *   was lost) → decided from the tenant snapshot, which is the source of
 *   truth: `provisioning_state === "ready"` → `succeeded`, else `failed`
 * - anything else → still running, left untouched
 */
export async function reconcileTenantOperations(
  options: ReconcileTenantOperationsOptions,
): Promise<ReconcileTenantOperationsResult> {
  const { stores, tenants, binding } = options;
  const recorder = createOperationRecorder(stores);
  const minAgeMs = options.minAgeMs ?? 10 * 60 * 1000;
  const limit = options.limit ?? 100;

  const cutoff = new Date(Date.now() - minAgeMs).toISOString();
  const { operations } = await stores.tenantOperations.list({
    status: ["pending", "running"],
    engine: TENANT_OPERATION_ENGINE,
    updated_before: cutoff,
    per_page: limit,
  });

  const result: ReconcileTenantOperationsResult = {
    scanned: operations.length,
    markedFailed: 0,
    markedSucceeded: 0,
    stillRunning: 0,
    instanceMissing: 0,
    errors: 0,
  };

  for (const operation of operations) {
    try {
      await reconcileOne(operation);
    } catch (error) {
      result.errors++;
      options.logger?.warn(
        `Failed to reconcile tenant operation ${operation.id}:`,
        error,
      );
    }
  }

  return result;

  async function markFailed(
    operation: TenantOperation,
    reason: string,
  ): Promise<void> {
    await recorder.appendEvent(operation.id, {
      step: operation.current_step ?? "reconcile",
      outcome: "reconciled",
      detail: { resolution: "failed", reason },
    });
    await recorder.markFailed(operation.id, reason);

    // A provision that died mid-run can leave the tenant snapshot stuck in
    // `pending` — surface the failure there too.
    if (operation.kind === "provision" && operation.tenant_id) {
      const tenant = await tenants.get(operation.tenant_id);
      if (tenant?.provisioning_state === "pending") {
        await tenants.update(operation.tenant_id, {
          provisioning_state: "failed",
          provisioning_error: reason.slice(0, 2048),
          provisioning_state_changed_at: new Date().toISOString(),
        });
      }
    }
  }

  async function reconcileOne(operation: TenantOperation): Promise<void> {
    // Re-check terminality: an instance may have finished (and written its
    // terminal state) between the list query and now.
    const current = await stores.tenantOperations.get(operation.id);
    if (!current || isTerminalStatus(current.status)) return;

    const instanceId =
      current.engine_instance_id ?? buildEngineInstanceId(current);

    let handle;
    try {
      handle = await binding.get(instanceId);
    } catch {
      result.instanceMissing++;
      result.markedFailed++;
      await markFailed(
        current,
        `engine instance "${instanceId}" not found (expired past retention or never started)`,
      );
      return;
    }

    const status = await handle.status();

    if (status.status === "errored" || status.status === "terminated") {
      const engineError =
        typeof status.error === "string"
          ? status.error
          : (status.error?.message ?? `engine reported ${status.status}`);
      result.markedFailed++;
      await markFailed(current, engineError);
      return;
    }

    if (status.status === "complete") {
      // The run completed but its terminal DB write was lost. The tenant
      // snapshot is the source of truth for what actually happened.
      const tenant = current.tenant_id
        ? await tenants.get(current.tenant_id)
        : null;
      if (tenant?.provisioning_state === "ready") {
        result.markedSucceeded++;
        await recorder.appendEvent(current.id, {
          step: current.current_step ?? "reconcile",
          outcome: "reconciled",
          detail: { resolution: "succeeded" },
        });
        await recorder.markSucceeded(current.id);
      } else {
        result.markedFailed++;
        await markFailed(
          current,
          "engine instance completed but the operation was never finalized and the tenant is not ready",
        );
      }
      return;
    }

    // queued / running / waiting / unknown — leave it for the next sweep.
    result.stillRunning++;
  }
}
