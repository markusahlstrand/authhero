import { z } from "@hono/zod-openapi";

/**
 * Durable tenant lifecycle operations (issue #1026). Each row is one
 * provision / seed / upgrade / backup / deprovision run against a tenant
 * (or the whole fleet when `tenant_id` is null). The tenant row's
 * `provisioning_state` / `worker_version` / `database_version` remain the
 * current-state snapshot; operations are the append-only log explaining how
 * the snapshot got there.
 */
export const tenantOperationKindSchema = z.enum([
  "provision",
  "seed",
  "upgrade",
  "backup",
  "deprovision",
  "users_import",
]);
export type TenantOperationKind = z.infer<typeof tenantOperationKindSchema>;

export const tenantOperationStatusSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type TenantOperationStatus = z.infer<typeof tenantOperationStatusSchema>;

/**
 * Which driver advances an operation. Deliberately an open string, not an
 * enum: the engine name is recorded in a core database column, so closing
 * it here would bake vendor names into the schema and lock out
 * self-hosters running their own driver (pg-boss, BullMQ, SQS, a plain
 * cron). The values AuthHero ships are {@link KNOWN_TENANT_OPERATION_ENGINES}.
 *
 * Durability never depends on this value. Operation progress is checkpointed
 * in the database (for `users_import`, one `tenant_operation_rows` row per
 * user), so a crashed driver loses nothing and any other driver can resume
 * the work.
 */
export const tenantOperationEngineSchema = z.string().max(64);
export type TenantOperationEngine = z.infer<typeof tenantOperationEngineSchema>;

/** Engines AuthHero ships. Not exhaustive — the column accepts any name. */
export const KNOWN_TENANT_OPERATION_ENGINES = [
  "inline",
  "cloudflare-workflows",
] as const;

export const tenantOperationInsertSchema = z.object({
  /** Target tenant; null for fleet-level operations. */
  tenant_id: z.string().max(255).nullable().default(null),
  /** Set when the operation was created by a rollout coordinator. */
  rollout_id: z.string().max(255).nullable().optional(),
  kind: tenantOperationKindSchema,
  engine: tenantOperationEngineSchema,
  /**
   * Deterministic engine handle (e.g. a Cloudflare Workflows instance id)
   * so live engine detail can be re-derived without lookups.
   */
  engine_instance_id: z.string().max(100).nullable().optional(),
  target_worker_version: z.string().max(255).nullable().optional(),
  target_database_version: z.string().max(255).nullable().optional(),
  /** Sub of the caller, `rollout:<id>`, or `system`. */
  initiated_by: z.string().max(255).nullable().optional(),
  /**
   * Kind-specific parameters, fixed when the operation is created. For
   * `users_import`: `connection_id`, `upsert`, `external_id`,
   * `send_completion_email`. Never contains secrets — it is readable by
   * anyone who can read the operation.
   */
  input: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type TenantOperationInsert = z.input<typeof tenantOperationInsertSchema>;

export const tenantOperationSchema = tenantOperationInsertSchema.extend({
  id: z.string(),
  status: tenantOperationStatusSchema,
  current_step: z.string().max(255).nullable().optional(),
  error: z.string().nullable().optional(),
  /**
   * Terminal (or in-progress) outcome summary. For `users_import`, the
   * Auth0 job summary: `{ total, inserted, updated, failed }`.
   */
  result: z.record(z.string(), z.unknown()).nullable().optional(),
  /**
   * Lease held by the driver currently advancing this operation. Prevents
   * two drivers doing the same work concurrently; it is NOT what makes the
   * operation correct (per-row checkpoints are). An expired lease is
   * reclaimable by any driver.
   */
  claimed_by: z.string().max(255).nullable().optional(),
  /** ISO timestamp after which {@link claimed_by} may be overridden. */
  claim_expires_at: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  finished_at: z.string().nullable().optional(),
});
export type TenantOperation = z.infer<typeof tenantOperationSchema>;

export const tenantOperationUpdateSchema = tenantOperationSchema
  .pick({
    status: true,
    current_step: true,
    engine_instance_id: true,
    target_worker_version: true,
    target_database_version: true,
    error: true,
    result: true,
    claimed_by: true,
    claim_expires_at: true,
    finished_at: true,
  })
  .partial();
export type TenantOperationUpdate = z.infer<typeof tenantOperationUpdateSchema>;
