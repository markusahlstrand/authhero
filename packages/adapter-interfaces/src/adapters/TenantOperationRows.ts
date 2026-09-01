import {
  TenantOperationRow,
  TenantOperationRowCounts,
  TenantOperationRowInsert,
  TenantOperationRowOutcome,
  TenantOperationRowStatus,
} from "../types/TenantOperationRow";
import { ListParams } from "../types/ListParams";

export interface ListTenantOperationRowsParams extends ListParams {
  /** Single status or a set (the errors endpoint queries `failed`). */
  status?: TenantOperationRowStatus | TenantOperationRowStatus[];
}

export interface ListTenantOperationRowsResult {
  rows: TenantOperationRow[];
  start: number;
  limit: number;
  length: number;
}

/**
 * Per-item checkpoints for batch tenant operations (issue #1325).
 *
 * Like `tenantOperations` this is a control-plane adapter, so it is
 * unscoped — rows are addressed by `operation_id`, and the operation row
 * carries the `tenant_id`.
 *
 * The contract that makes batch operations resumable: `createMany` stages
 * every item as `pending`, `claimPending` hands a worker the next slice of
 * unprocessed items, and `recordOutcomes` commits their terminal statuses.
 * An interrupted run leaves its items `pending` and is retried verbatim,
 * so implementations MUST make `recordOutcomes` atomic per call and MUST
 * NOT mutate rows that already hold a terminal status.
 */
export interface TenantOperationRowsAdapter {
  /**
   * Stage items in bulk. Implementations should insert in batches rather
   * than one statement per row — callers stage thousands at a time.
   * Returns the number of rows written.
   */
  createMany(rows: TenantOperationRowInsert[]): Promise<number>;

  /**
   * Fetch the next `limit` items still awaiting processing, ordered by
   * `seq` ascending. Does not itself lock — exclusivity between drivers
   * comes from the lease on the parent operation
   * (`TenantOperationsAdapter.claim`).
   */
  claimPending(
    operation_id: string,
    limit: number,
  ): Promise<TenantOperationRow[]>;

  /**
   * Commit terminal outcomes for processed items. Idempotent: applying an
   * outcome to a row that is already terminal is a no-op, so a retried
   * chunk cannot corrupt earlier results. Returns rows actually updated.
   */
  recordOutcomes(
    operation_id: string,
    outcomes: TenantOperationRowOutcome[],
  ): Promise<number>;

  /** Row counts per status, used to build the operation's summary. */
  countByStatus(operation_id: string): Promise<TenantOperationRowCounts>;

  /** Paginated read, ordered by `seq` ascending. Backs the errors endpoint. */
  list(
    operation_id: string,
    params?: ListTenantOperationRowsParams,
  ): Promise<ListTenantOperationRowsResult>;

  /**
   * Retention cleanup. Also runs via the cascade when the parent operation
   * is removed; exposed separately so a sweep can drop staged payloads
   * without deleting the operation's audit record.
   */
  removeByOperation(operation_id: string): Promise<number>;
}
