import { z } from "@hono/zod-openapi";

/**
 * Append-only per-step history for a tenant operation (issue #1026).
 * One row per step boundary: started / succeeded / failed / retried /
 * skipped, plus `reconciled` when the reconciler sweep copies a terminal
 * engine state into the database after an instance died mid-run.
 */
export const tenantOperationEventOutcomeSchema = z.enum([
  "started",
  "succeeded",
  "failed",
  "retried",
  "skipped",
  "reconciled",
]);
export type TenantOperationEventOutcome = z.infer<
  typeof tenantOperationEventOutcomeSchema
>;

export const tenantOperationEventInsertSchema = z.object({
  operation_id: z.string().max(255),
  step: z.string().max(255),
  outcome: tenantOperationEventOutcomeSchema,
  detail: z.record(z.string(), z.unknown()).nullable().optional(),
  attempt: z.number().int().min(1).default(1),
});
export type TenantOperationEventInsert = z.input<
  typeof tenantOperationEventInsertSchema
>;

export const tenantOperationEventSchema =
  tenantOperationEventInsertSchema.extend({
    id: z.string(),
    created_at: z.string(),
  });
export type TenantOperationEvent = z.infer<typeof tenantOperationEventSchema>;
