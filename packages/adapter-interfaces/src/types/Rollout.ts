import { z } from "@hono/zod-openapi";

/**
 * Fleet operation coordinating per-tenant operations in waves with a canary
 * and a health gate (issue #1026). Progress is derived by querying
 * `tenant_operations` rows with this rollout's id — there are no
 * denormalized counters.
 */
export const rolloutKindSchema = z.enum(["upgrade", "reseed", "backup"]);
export type RolloutKind = z.infer<typeof rolloutKindSchema>;

export const rolloutStatusSchema = z.enum([
  "pending",
  "canary",
  "rolling",
  "paused",
  "done",
  "failed",
]);
export type RolloutStatus = z.infer<typeof rolloutStatusSchema>;

export const rolloutInsertSchema = z.object({
  kind: rolloutKindSchema,
  target_worker_version: z.string().max(255).nullable().optional(),
  target_database_version: z.string().max(255).nullable().optional(),
  wave_size: z.number().int().min(1).default(10),
  canary_tenant_ids: z.array(z.string()).nullable().optional(),
  /** Which tenants the rollout targets (e.g. `{ deployment_type: "wfp" }`). */
  filter: z.record(z.string(), z.unknown()).nullable().optional(),
  initiated_by: z.string().max(255).nullable().optional(),
});
export type RolloutInsert = z.input<typeof rolloutInsertSchema>;

export const rolloutSchema = rolloutInsertSchema.extend({
  id: z.string(),
  status: rolloutStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
  finished_at: z.string().nullable().optional(),
});
export type Rollout = z.infer<typeof rolloutSchema>;

export const rolloutUpdateSchema = rolloutSchema
  .pick({
    status: true,
    wave_size: true,
    canary_tenant_ids: true,
    filter: true,
    finished_at: true,
  })
  .partial();
export type RolloutUpdate = z.infer<typeof rolloutUpdateSchema>;
