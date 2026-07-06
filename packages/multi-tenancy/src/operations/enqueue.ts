import { TenantOperation } from "authhero";
import {
  EnqueueTenantOperationParams,
  TenantOperationExecutor,
  TenantOperationStores,
} from "./types";
import { buildEngineInstanceId } from "./instance-id";
import { createOperationRecorder, isTerminalStatus } from "./recorder";

/**
 * Persist a new operation row and stamp its deterministic engine instance
 * id. Shared by the executor enqueue path and the inline recording wrapper
 * (`runRecordedTenantOperation`) so the row-first setup can't drift.
 */
export async function createOperationRow(
  stores: TenantOperationStores,
  params: EnqueueTenantOperationParams,
  engine: TenantOperationExecutor["engine"],
): Promise<TenantOperation> {
  const created = await stores.tenantOperations.create({
    tenant_id: params.tenant_id,
    rollout_id: params.rollout_id,
    kind: params.kind,
    engine,
    initiated_by: params.initiated_by,
    target_worker_version: params.target_worker_version,
    target_database_version: params.target_database_version,
  });

  const engine_instance_id = buildEngineInstanceId(created);
  await stores.tenantOperations.update(created.id, { engine_instance_id });
  return { ...created, engine_instance_id };
}

/**
 * Row-first enqueue: persist the operation as `pending`, write the
 * deterministic engine instance id, then hand it to the executor. If
 * `start` throws, the row is marked failed (unless the executor already
 * finalized it) and the error is rethrown so callers keep their existing
 * failure semantics.
 */
export async function enqueueTenantOperation(
  stores: TenantOperationStores,
  executor: TenantOperationExecutor,
  params: EnqueueTenantOperationParams,
): Promise<TenantOperation> {
  const recorder = createOperationRecorder(stores);

  const operation = await createOperationRow(stores, params, executor.engine);

  try {
    await executor.start(operation);
  } catch (error) {
    const current = await stores.tenantOperations.get(operation.id);
    if (current && !isTerminalStatus(current.status)) {
      await recorder.markFailed(operation.id, error);
    }
    throw error;
  }

  return (await stores.tenantOperations.get(operation.id)) ?? operation;
}
