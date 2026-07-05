import {
  TenantOperationEvent,
  TenantOperationEventInsert,
} from "../types/TenantOperationEvent";
import { ListParams } from "../types/ListParams";

export interface ListTenantOperationEventsResult {
  events: TenantOperationEvent[];
  start: number;
  limit: number;
  length: number;
}

/**
 * Append-only step history for tenant operations — no update or remove;
 * rows are deleted only via the cascade when their operation is removed.
 */
export interface TenantOperationEventsAdapter {
  /** Generates the `evt_<nanoid>` id. */
  create(event: TenantOperationEventInsert): Promise<TenantOperationEvent>;
  /** Ordered `created_at` ascending (id as tiebreak). */
  listByOperation(
    operation_id: string,
    params?: ListParams,
  ): Promise<ListTenantOperationEventsResult>;
}
