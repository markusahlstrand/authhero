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
  value: z.string(),
});

export const actionInsertSchema = z.object({
  name: z.string().max(255),
  code: z.string().max(100_000),
  supported_triggers: z.array(actionTriggerSchema).optional(),
  runtime: z.string().max(50).optional(),
  dependencies: z.array(actionDependencySchema).optional(),
  secrets: z.array(actionSecretSchema).optional(),
});
export type ActionInsert = z.infer<typeof actionInsertSchema>;

export const actionSchema = actionInsertSchema.extend({
  id: z.string(),
  tenant_id: z.string(),
  status: z.enum(["draft", "built"]).default("built"),
  deployed_at: z.string().optional(),
  // Override secrets to return names only (no values) in responses
  secrets: z
    .array(
      z.object({
        name: z.string(),
        value: z.string().optional(),
      }),
    )
    .optional(),
  ...baseEntitySchema.shape,
});
export type Action = z.infer<typeof actionSchema>;
