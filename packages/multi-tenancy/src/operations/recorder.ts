import { TenantOperation } from "authhero";
import { TenantOperationStores } from "./types";

const MAX_ERROR_LENGTH = 2048;

export function errorToMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : String(error ?? "unknown error");
  return message.slice(0, MAX_ERROR_LENGTH);
}

/**
 * Write-back helpers for the operation log, callable with just stores and
 * an operation id. All writes are idempotent (safe under workflow-step
 * replay): status transitions rewrite the same values, and duplicate
 * events are harmless in an append-only step history.
 *
 * These helpers throw on write failure — in the executor path the log IS
 * the deliverable. Callers that must never let recording break the actual
 * work (the provisioning recording wrapper) catch and warn instead.
 */
export function createOperationRecorder(stores: TenantOperationStores) {
  const { tenantOperations, tenantOperationEvents } = stores;

  return {
    async markRunning(operationId: string, currentStep?: string) {
      await tenantOperations.update(operationId, {
        status: "running",
        ...(currentStep !== undefined ? { current_step: currentStep } : {}),
      });
    },

    async setCurrentStep(operationId: string, step: string) {
      await tenantOperations.update(operationId, { current_step: step });
    },

    async appendEvent(
      operationId: string,
      event: {
        step: string;
        outcome:
          | "started"
          | "succeeded"
          | "failed"
          | "retried"
          | "skipped"
          | "reconciled";
        detail?: Record<string, unknown>;
        attempt?: number;
      },
    ) {
      await tenantOperationEvents.create({
        operation_id: operationId,
        step: event.step,
        outcome: event.outcome,
        detail: event.detail,
        attempt: event.attempt ?? 1,
      });
    },

    async markSucceeded(operationId: string) {
      await tenantOperations.update(operationId, {
        status: "succeeded",
        error: null,
        finished_at: new Date().toISOString(),
      });
    },

    async markFailed(operationId: string, error: unknown) {
      await tenantOperations.update(operationId, {
        status: "failed",
        error: errorToMessage(error),
        finished_at: new Date().toISOString(),
      });
    },
  };
}

export type OperationRecorder = ReturnType<typeof createOperationRecorder>;

/** True when the operation can no longer transition (reconciler guard). */
export function isTerminalStatus(status: TenantOperation["status"]): boolean {
  return (
    status === "succeeded" || status === "failed" || status === "cancelled"
  );
}
