import { z } from "@hono/zod-openapi";
import { baseEntitySchema } from "./BaseEntity";

// Define allowed trigger IDs for different hook types
const webHookAllowedTriggers = z.enum([
  "pre-user-registration",
  "post-user-registration",
  "post-user-login",
  "post-user-update",
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
  "post-user-registration",
  "post-user-update",
  "credentials-exchange",
]);

const codeHookAllowedTriggers = z.enum([
  "post-user-login",
  "credentials-exchange",
  "pre-user-registration",
  "post-user-registration",
]);

// Available template IDs mapped to their trigger types
export const hookTemplateId = z.enum([
  "ensure-username",
  "set-preferred-username",
  "account-linking",
]);
export type HookTemplateId = z.infer<typeof hookTemplateId>;

/**
 * Registry of available hook templates.
 * Maps template IDs to their metadata and allowed triggers. Some templates
 * (e.g. `account-linking`) can bind to more than one trigger; in that case
 * `trigger_ids` lists every trigger the template supports.
 */
export const hookTemplates: Record<
  HookTemplateId,
  {
    name: string;
    description: string;
    trigger_ids: string[];
  }
> = {
  "ensure-username": {
    name: "Ensure Username",
    description:
      "Automatically assigns a username to users who sign in without one. Creates a linked username account for social/email users.",
    trigger_ids: ["post-user-login"],
  },
  "set-preferred-username": {
    name: "Set Preferred Username",
    description:
      "Sets the preferred_username claim on tokens based on the username from the primary or linked user.",
    trigger_ids: ["credentials-exchange"],
  },
  "account-linking": {
    name: "Account Linking",
    description:
      "Links a user to an existing primary account with the same verified email. Idempotent — safe to run on every login, registration, and email update.",
    trigger_ids: [
      "post-user-login",
      "post-user-registration",
      "post-user-update",
    ],
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

const codeHookInsertSchema = z.object({
  ...hookBaseCommonProperties,
  trigger_id: codeHookAllowedTriggers,
  code_id: z.string(),
});

export const hookInsertSchema = z.union([
  webHookInsertSchema,
  formHookInsertSchema,
  templateHookInsertSchema,
  codeHookInsertSchema,
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

const codeHookSchema = z.object({
  ...hookBaseCommonProperties,
  trigger_id: codeHookAllowedTriggers,
  ...baseEntitySchema.shape,
  hook_id: z.string(),
  code_id: z.string(),
});

export const hookSchema = z.union([
  webHookSchema,
  formHookSchema,
  templateHookSchema,
  codeHookSchema,
]);

export type Hook = z.infer<typeof hookSchema>;
