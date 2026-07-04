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

export const tenantOperationEngineSchema = z.enum([
  "inline",
  "cloudflare-workflows",
]);
export type TenantOperationEngine = z.infer<typeof tenantOperationEngineSchema>;

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
});
export type TenantOperationInsert = z.input<typeof tenantOperationInsertSchema>;

export const tenantOperationSchema = tenantOperationInsertSchema.extend({
  id: z.string(),
  status: tenantOperationStatusSchema,
  current_step: z.string().max(255).nullable().optional(),
  error: z.string().nullable().optional(),
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
    finished_at: true,
  })
  .partial();
export type TenantOperationUpdate = z.infer<typeof tenantOperationUpdateSchema>;
