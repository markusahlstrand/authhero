import { DataAdapters } from "authhero";
import {
  EnqueueTenantOperationParams,
  StepReporter,
  TenantOperationStores,
} from "./types";
import { createOperationRow } from "./enqueue";
import { createOperationRecorder, errorToMessage } from "./recorder";

function getStores(adapters: DataAdapters): TenantOperationStores | undefined {
  if (adapters.tenantOperations && adapters.tenantOperationEvents) {
    return {
      tenantOperations: adapters.tenantOperations,
      tenantOperationEvents: adapters.tenantOperationEvents,
    };
  }
  return undefined;
}

/**
 * Wraps an existing inline lifecycle flow (today: the provisioning hook)
 * so it is recorded as a tenant operation with step events — with NO
 * behavior change:
 *
 * - When the operations adapters are absent, `fn` runs exactly as before.
 * - Recording writes are best-effort (warn-only): a broken control-plane
 *   log must never block or fail a provision. This mirrors the existing
 *   markFailed philosophy in the WFP tenant hook.
 * - `fn`'s error is always rethrown, preserving the caller's rollback
 *   semantics.
 *
 * `fn` receives a StepReporter it may call at step boundaries; if it never
 * does (e.g. a custom onProvision that ignores the parameter), a single
 * coarse step named after the operation kind is recorded instead.
 */
export async function runRecordedTenantOperation(
  adapters: DataAdapters,
  params: EnqueueTenantOperationParams,
  fn: (report: StepReporter | undefined) => Promise<void>,
): Promise<void> {
  const stores = getStores(adapters);
  if (!stores) {
    await fn(undefined);
    return;
  }

  const recorder = createOperationRecorder(stores);

  const safe = async (write: () => Promise<void>) => {
    try {
      await write();
    } catch (error) {
      console.warn("Failed to record tenant operation progress:", error);
    }
  };

  let operationId: string | undefined;
  await safe(async () => {
    const created = await createOperationRow(stores, params, "inline");
    operationId = created.id;
    await recorder.markRunning(created.id);
  });

  // The log row could not even be created — run the work unrecorded.
  if (!operationId) {
    await fn(undefined);
    return;
  }
  const id = operationId;

  let reported = false;
  const report: StepReporter = async (step, outcome, detail) => {
    reported = true;
    await safe(async () => {
      if (outcome === "started") {
        await recorder.setCurrentStep(id, step);
      }
      await recorder.appendEvent(id, { step, outcome, detail });
    });
  };

  try {
    await fn(report);
  } catch (error) {
    await safe(async () => {
      if (!reported) {
        await recorder.appendEvent(id, {
          step: params.kind,
          outcome: "failed",
          detail: { message: errorToMessage(error) },
        });
      }
      await recorder.markFailed(id, error);
    });
    throw error;
  }

  await safe(async () => {
    if (!reported) {
      await recorder.appendEvent(id, {
        step: params.kind,
        outcome: "succeeded",
      });
    }
    await recorder.markSucceeded(id);
  });
}
