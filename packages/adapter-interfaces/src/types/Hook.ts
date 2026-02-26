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

const templateHookAllowedTriggers = z.enum([
  "post-user-login",
  "credentials-exchange",
]);

// Available template IDs mapped to their trigger types
export const hookTemplateId = z.enum([
  "ensure-username",
  "set-preferred-username",
]);
export type HookTemplateId = z.infer<typeof hookTemplateId>;

/**
 * Registry of available hook templates.
 * Maps template IDs to their metadata and allowed triggers.
 */
export const hookTemplates: Record<
  HookTemplateId,
  {
    name: string;
    description: string;
    trigger_id: string;
  }
> = {
  "ensure-username": {
    name: "Ensure Username",
    description:
      "Automatically assigns a username to users who sign in without one. Creates a linked username account for social/email users.",
    trigger_id: "post-user-login",
  },
  "set-preferred-username": {
    name: "Set Preferred Username",
    description:
      "Sets the preferred_username claim on tokens based on the username from the primary or linked user.",
    trigger_id: "credentials-exchange",
  },
};

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

const templateHookInsertSchema = z.object({
  ...hookBaseCommonProperties,
  trigger_id: templateHookAllowedTriggers,
  template_id: hookTemplateId,
});

export const hookInsertSchema = z.union([
  webHookInsertSchema,
  formHookInsertSchema,
  templateHookInsertSchema,
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

const templateHookSchema = z.object({
  ...hookBaseCommonProperties,
  trigger_id: templateHookAllowedTriggers,
  ...baseEntitySchema.shape,
  hook_id: z.string(),
  template_id: hookTemplateId,
});

export const hookSchema = z.union([
  webHookSchema,
  formHookSchema,
  templateHookSchema,
]);

export type Hook = z.infer<typeof hookSchema>;
