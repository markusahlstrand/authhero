import {
  TenantOperation,
  TenantOperationEngine,
  TenantOperationInsert,
  TenantOperationKind,
  TenantOperationStatus,
  TenantOperationUpdate,
} from "../types/TenantOperation";
import { ListParams } from "../types/ListParams";

/**
 * Tenant operations are control-plane entities (like `tenants` itself), so
 * the adapter is unscoped: `tenant_id` is a list filter, not a scoping
 * argument, and is null for fleet-level operations.
 */
export interface ListTenantOperationsParams extends ListParams {
  tenant_id?: string;
  rollout_id?: string;
  kind?: TenantOperationKind;
  /** Single status or a set (the reconciler queries pending + running). */
  status?: TenantOperationStatus | TenantOperationStatus[];
  engine?: TenantOperationEngine;
  /** Only operations whose `updated_at` is strictly before this ISO timestamp. */
  updated_before?: string;
}

export interface ListTenantOperationsResult {
  operations: TenantOperation[];
  start: number;
  limit: number;
  length: number;
}

export interface TenantOperationsAdapter {
  /** Generates the `op_<nanoid>` id and inserts with status `pending`. */
  create(operation: TenantOperationInsert): Promise<TenantOperation>;
  get(id: string): Promise<TenantOperation | null>;
  /** Default sort: `created_at` descending. */
  list(
    params?: ListTenantOperationsParams,
  ): Promise<ListTenantOperationsResult>;
  /** Always bumps `updated_at`. */
  update(id: string, operation: TenantOperationUpdate): Promise<boolean>;

  /**
   * Atomically take the lease on an operation so only one driver advances
   * it at a time. Succeeds when the operation is unclaimed or its existing
   * lease has expired (or is already held by `worker_id`, making re-claim
   * by the same worker a no-op); returns false when another live worker
   * holds it.
   *
   * The lease is an efficiency guard, not a correctness guard — per-item
   * checkpoints in `tenant_operation_rows` are what keep a batch operation
   * correct if two drivers ever overlap. Implementations MUST perform the
   * check and the write in a single conditional statement.
   */
  claim(id: string, worker_id: string, leaseMs: number): Promise<boolean>;

  /**
   * Release a lease held by `worker_id`. Returns false when the lease has
   * since been taken by someone else, in which case the caller must not
   * assume its own writes were the last ones.
   */
  release(id: string, worker_id: string): Promise<boolean>;

  /**
   * Operations that still have work to do and are free to be picked up:
   * status `pending` or `running`, matching `kind`, whose lease is absent
   * or expired. Ordered `created_at` ascending so the oldest unfinished
   * work drains first. Backs the resume sweep that guarantees a batch
   * completes even when every driver that touched it died.
   */
  listResumable(params: {
    kind: TenantOperationKind;
    limit: number;
  }): Promise<TenantOperation[]>;
  /** Retention cleanup only — not exposed via routes; events cascade. */
  remove(id: string): Promise<boolean>;
}
