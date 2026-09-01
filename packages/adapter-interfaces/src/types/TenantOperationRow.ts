import { z } from "@hono/zod-openapi";

/**
 * Per-item checkpoint for a batch tenant operation (issue #1325).
 *
 * One row per item in the operation's input — for `users_import`, one per
 * user in the uploaded file. This table is what makes a batch operation
 * durable and resumable: an item is staged as `pending`, and its terminal
 * status is committed in the same chunk that performs the write. A driver
 * that dies mid-run leaves its unprocessed items `pending`, so any other
 * driver (a cron sweep, a workflow step, a later request) resumes exactly
 * where it stopped, without re-doing committed work.
 *
 * Durability therefore does not depend on the execution engine — engines
 * only decide *who* advances the operation and *how fast*.
 */
export const tenantOperationRowStatusSchema = z.enum([
  /** Staged, not yet processed. */
  "pending",
  /** A new entity was created for this item. */
  "inserted",
  /** An existing entity was updated (upsert). */
  "updated",
  /** Permanently rejected; see `error_code` / `error_message`. */
  "failed",
  /** Deliberately not processed (e.g. a duplicate later in the same file). */
  "skipped",
]);
export type TenantOperationRowStatus = z.infer<
  typeof tenantOperationRowStatusSchema
>;

/** Terminal statuses — a row in any of these is never reprocessed. */
export const TERMINAL_TENANT_OPERATION_ROW_STATUSES: readonly TenantOperationRowStatus[] =
  ["inserted", "updated", "failed", "skipped"];

export const tenantOperationRowInsertSchema = z.object({
  operation_id: z.string().max(255),
  /**
   * Zero-based position of this item in the submitted input. Unique per
   * operation, and the order in which items are processed and reported.
   */
  seq: z.number().int().min(0),
  /**
   * The original input item, verbatim, except that credential material is
   * redacted before staging — never store a password hash here. Echoed
   * back by the Auth0-compatible `GET /jobs/{id}/errors` endpoint.
   */
  payload: z.record(z.string(), z.unknown()),
  status: tenantOperationRowStatusSchema.default("pending"),
  /** Machine-readable failure reason, e.g. `UNSUPPORTED_HASH_ALGORITHM`. */
  error_code: z.string().max(64).nullable().optional(),
  error_message: z.string().nullable().optional(),
  /** Field path the error refers to, e.g. `custom_password_hash.algorithm`. */
  error_path: z.string().max(255).nullable().optional(),
  /** Id of the entity created or updated for this item, when it succeeded. */
  entity_id: z.string().max(255).nullable().optional(),
});
export type TenantOperationRowInsert = z.input<
  typeof tenantOperationRowInsertSchema
>;

export const tenantOperationRowSchema = tenantOperationRowInsertSchema.extend({
  status: tenantOperationRowStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
});
export type TenantOperationRow = z.infer<typeof tenantOperationRowSchema>;

/** The per-item outcome a processor reports back for one staged row. */
export const tenantOperationRowOutcomeSchema = z.object({
  seq: z.number().int().min(0),
  status: tenantOperationRowStatusSchema,
  error_code: z.string().max(64).nullable().optional(),
  error_message: z.string().nullable().optional(),
  error_path: z.string().max(255).nullable().optional(),
  entity_id: z.string().max(255).nullable().optional(),
});
export type TenantOperationRowOutcome = z.infer<
  typeof tenantOperationRowOutcomeSchema
>;

/** Count of rows in each status, used to build a job summary. */
export interface TenantOperationRowCounts {
  total: number;
  pending: number;
  inserted: number;
  updated: number;
  failed: number;
  skipped: number;
}
