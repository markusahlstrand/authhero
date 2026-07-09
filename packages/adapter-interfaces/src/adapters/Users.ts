import { User, Totals, UserInsert } from "../types";
import { AuditEventInsert } from "../types/AuditEvent";
import { ListParams } from "../types/ListParams";
import { CreateOptions } from "../types/ImportMetadata";

export interface ListUsersResponse extends Totals {
  users: User[];
}

/**
 * An outbox event to persist atomically with a business write. It carries a
 * caller-assigned `id` so the enqueuer can relay it (push it onto the request's
 * outbox-event list for delivery) without a return round-trip from the adapter.
 */
export type OutboxEventInsert = AuditEventInsert & { id: string };

/**
 * Options common to the event-emitting user writes. When `outboxEvents` are
 * supplied, the adapter MUST persist them in the same atomic unit as the
 * business write — a single `db.batch()` on D1, one transaction on
 * kysely/better-sqlite3 — so the business row and its event row commit together
 * or not at all (the defining guarantee of the transactional outbox pattern).
 */
export interface WriteOptions {
  outboxEvents?: OutboxEventInsert[];
}

export interface UserDataAdapter {
  get(tenant_id: string, id: string): Promise<User | null>;
  create(
    tenantId: string,
    user: UserInsert,
    options?: CreateOptions,
  ): Promise<User>;
  /**
   * Create a user without invoking any decorator-level hooks (pre/post
   * registration hooks, linking, webhooks, etc.). Intended to be called from
   * inside a registration pipeline that owns hook orchestration and transaction
   * boundaries itself. The DB-level behavior is identical to `create`.
   *
   * Pass `options.outboxEvents` to persist post-registration outbox events in
   * the same atomic unit as the user row.
   */
  rawCreate(
    tenantId: string,
    user: UserInsert,
    options?: WriteOptions,
  ): Promise<User>;
  remove(
    tenantId: string,
    id: string,
    options?: WriteOptions,
  ): Promise<boolean>;
  list(tenantId: string, params?: ListParams): Promise<ListUsersResponse>;
  update(
    tenantId: string,
    id: string,
    user: Partial<User>,
    options?: WriteOptions,
  ): Promise<boolean>;
  unlink(
    tenantId: string,
    id: string,
    provider: string,
    linked_user_id: string,
  ): Promise<boolean>;
}
