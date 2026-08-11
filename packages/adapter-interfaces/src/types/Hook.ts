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

// Page hooks render a built-in universal-login interstitial (e.g. the
// impersonation page) after authentication, so they only make sense on the
// post-login trigger.
const pageHookAllowedTriggers = z.enum(["post-user-login"]);

/**
 * Built-in universal-login pages a page hook can interrupt the login with.
 * The runtime redirects to `/u/{page_id}` (or `/u2/{page_id}`), so this enum
 * is the allowlist of interstitial screens — a free-form string would let a
 * misconfigured hook bounce logins to an arbitrary universal-login path.
 */
export const hookPageId = z.enum(["impersonate"]);
export type HookPageId = z.infer<typeof hookPageId>;

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
  /**
   * Free-form key/value bag for hook properties. Two well-known keys:
   *
   * - `inheritable: true` — when set on a hook on the control-plane tenant,
   *   the multi-tenancy sync surfaces this hook to sub-tenants (Phase 2).
   * - Template-specific options. Templates read their config here, e.g.
   *   `account-linking` reads `copy_user_metadata: true` to merge secondary
   *   user_metadata into the primary on link.
   *
   * Everything else is opaque to the runtime. Persisted as JSON.
   */
  metadata: z.record(z.string(), z.unknown()).optional(),
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

const pageHookInsertSchema = z.object({
  ...hookBaseCommonProperties,
  trigger_id: pageHookAllowedTriggers,
  page_id: hookPageId,
  /**
   * Permission name the logged-in user must hold on the tenant for the page
   * to interrupt the login (e.g. `users:impersonate`). Omitted means the page
   * shows for every fresh login.
   */
  permission_required: z.string().optional(),
});

export const hookInsertSchema = z.union([
  webHookInsertSchema,
  formHookInsertSchema,
  templateHookInsertSchema,
  codeHookInsertSchema,
  pageHookInsertSchema,
]);
export type HookInsert = z.infer<typeof hookInsertSchema>;

const webHookSchema = z
  .object({
    ...hookBaseCommonProperties,
    trigger_id: webHookAllowedTriggers,
  })
  .extend(baseEntitySchema.shape)
  .extend({
    hook_id: z.string(),
    url: z.string(),
  });

const formHookSchema = z
  .object({
    ...hookBaseCommonProperties,
    trigger_id: formHookAllowedTriggers,
  })
  .extend(baseEntitySchema.shape)
  .extend({
    hook_id: z.string(),
    form_id: z.string(),
  });

const templateHookSchema = z
  .object({
    ...hookBaseCommonProperties,
    trigger_id: templateHookAllowedTriggers,
  })
  .extend(baseEntitySchema.shape)
  .extend({
    hook_id: z.string(),
    template_id: hookTemplateId,
  });

const codeHookSchema = z
  .object({
    ...hookBaseCommonProperties,
    trigger_id: codeHookAllowedTriggers,
  })
  .extend(baseEntitySchema.shape)
  .extend({
    hook_id: z.string(),
    code_id: z.string(),
  });

const pageHookSchema = z
  .object({
    ...hookBaseCommonProperties,
    trigger_id: pageHookAllowedTriggers,
  })
  .extend(baseEntitySchema.shape)
  .extend({
    hook_id: z.string(),
    page_id: hookPageId,
    permission_required: z.string().optional(),
  });

export const hookSchema = z.union([
  webHookSchema,
  formHookSchema,
  templateHookSchema,
  codeHookSchema,
  pageHookSchema,
]);

export type Hook = z.infer<typeof hookSchema>;
