import { z } from "@hono/zod-openapi";
import { baseEntitySchema } from "./BaseEntity";

export const actionTriggerSchema = z.object({
  id: z.string(),
  version: z.string().optional(),
});

export const actionDependencySchema = z.object({
  name: z.string(),
  version: z.string(),
});

export const actionSecretSchema = z.object({
  name: z.string(),
  // Optional on writes so PATCH callers can omit the value to preserve the
  // existing secret. The adapter merges by name when value is missing.
  value: z.string().optional(),
});

export const actionInsertSchema = z.object({
  name: z.string().max(255),
  code: z.string().max(100_000),
  supported_triggers: z.array(actionTriggerSchema).optional(),
  runtime: z.string().max(50).optional(),
  dependencies: z.array(actionDependencySchema).optional(),
  secrets: z.array(actionSecretSchema).optional(),
  // Marks this action as a shared template owned by the control-plane tenant.
  // Other tenants can opt-in by creating a row with the same `name` and
  // `inherit: true`; at execute time the loader reads code from this row.
  is_system: z.boolean().optional(),
  // On a non-control-plane tenant, indicates the action's `code` should be
  // read through from the control-plane system action with a matching name.
  // The local `secrets` still override (local-first then upstream fallback).
  inherit: z.boolean().optional(),
});
export type ActionInsert = z.infer<typeof actionInsertSchema>;

export const actionUpdateSchema = actionInsertSchema.partial().extend({
  status: z.enum(["draft", "built"]).optional(),
  deployed_at: z.string().optional(),
});
export type ActionUpdate = z.infer<typeof actionUpdateSchema>;

export const actionSchema = actionInsertSchema
  .extend({
    id: z.string(),
    tenant_id: z.string(),
    status: z.enum(["draft", "built"]).default("built"),
    deployed_at: z.string().optional(),
    // Secrets keep their `value` here: this is the stored shape, and the code
    // hook executor reads the values at execution time to build the sandbox
    // environment. Anything serialised back over HTTP must use
    // `actionResponseSchema` instead, which drops `value`.
    secrets: z
      .array(
        z.object({
          name: z.string(),
          value: z.string().optional(),
        }),
      )
      .optional(),
  })
  .extend(baseEntitySchema.shape);
export type Action = z.infer<typeof actionSchema>;

/** A secret as it appears in an API response — name only, never the value. */
export const actionSecretNameSchema = z.object({
  name: z.string(),
});

/**
 * The action shape safe to return over HTTP.
 *
 * Identical to {@link actionSchema} except that secrets are narrowed to their
 * names, so a secret value cannot leak through a management-API response —
 * the route handlers already redact at runtime, and this makes the type
 * system enforce it rather than relying on every handler remembering.
 */
export const actionResponseSchema = actionSchema.extend({
  secrets: z.array(actionSecretNameSchema).optional(),
});
export type ActionResponse = z.infer<typeof actionResponseSchema>;
