import { z } from "@hono/zod-openapi";
import { baseEntitySchema } from "./BaseEntity";

// Define allowed trigger IDs for different hook types
const webHookAllowedTriggers = z.enum([
  "pre-user-registration",
  "post-user-registration",
  "post-user-login",
  "validate-registration-username",
  "pre-user-deletion",
  "post-user-deletion",
  // Potentially other triggers specific to webhooks in the future
]);

const formHookAllowedTriggers = z.enum([
  "pre-user-registration",
  "post-user-registration",
  "post-user-login",
  "validate-registration-username",
  "pre-user-deletion",
  "post-user-deletion",
]);

// Base properties common to hook definitions (excluding hook_id and trigger_id which vary)
const hookBaseCommonProperties = {
  enabled: z.boolean().default(false),
  synchronous: z.boolean().default(false),
  priority: z.number().optional(),
  hook_id: z.string().optional(),
};

const webHookInsertSchema = z.object({
  ...hookBaseCommonProperties,
  trigger_id: webHookAllowedTriggers,
  url: z.string(),
});

const formHookInsertSchema = z.object({
  ...hookBaseCommonProperties,
  trigger_id: formHookAllowedTriggers,
  form_id: z.string(),
});

export const hookInsertSchema = z.union([
  webHookInsertSchema,
  formHookInsertSchema,
]);
export type HookInsert = z.infer<typeof hookInsertSchema>;

const webHookSchema = z.object({
  ...hookBaseCommonProperties,
  trigger_id: webHookAllowedTriggers,
  ...baseEntitySchema.shape,
  hook_id: z.string(),
  url: z.string(),
});

const formHookSchema = z.object({
  ...hookBaseCommonProperties,
  trigger_id: formHookAllowedTriggers,
  ...baseEntitySchema.shape,
  hook_id: z.string(),
  form_id: z.string(),
});

export const hookSchema = z.union([webHookSchema, formHookSchema]);

export type Hook = z.infer<typeof hookSchema>;
