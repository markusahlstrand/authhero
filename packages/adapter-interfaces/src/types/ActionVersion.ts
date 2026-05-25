import { z } from "@hono/zod-openapi";
import { baseEntitySchema } from "./BaseEntity";
import {
  actionDependencySchema,
  actionSecretSchema,
  actionTriggerSchema,
} from "./Action";

export const actionVersionInsertSchema = z.object({
  action_id: z.string(),
  code: z.string().max(100_000),
  runtime: z.string().max(50).optional(),
  dependencies: z.array(actionDependencySchema).optional(),
  secrets: z.array(actionSecretSchema).optional(),
  supported_triggers: z.array(actionTriggerSchema).optional(),
  deployed: z.boolean().default(true),
});
export type ActionVersionInsert = z.infer<typeof actionVersionInsertSchema>;

export const actionVersionSchema = actionVersionInsertSchema
  .extend({
    id: z.string(),
    tenant_id: z.string(),
    number: z.number().int(),
  })
  .extend(baseEntitySchema.shape);
export type ActionVersion = z.infer<typeof actionVersionSchema>;
