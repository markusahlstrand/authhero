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
  /** Retention cleanup only — not exposed via routes; events cascade. */
  remove(id: string): Promise<boolean>;
}
