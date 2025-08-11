import { z } from "@hono/zod-openapi";
import {
  applicationSchema,
  brandingSchema,
  Code,
  connectionSchema,
  customDomainSchema,
  emailProviderSchema,
  formSchema,
  loginSessionSchema,
  Password,
  promptSettingSchema,
  refreshTokenSchema,
  sessionSchema,
  SigningKey,
  Tenant,
  themeSchema,
  userSchema,
  // New entity schemas
  resourceServerSchema,
  ruleSchema,
  permissionSchema,
} from "@authhero/adapter-interfaces";
import { SqlLog } from "./logs/Log";
import { flattenSchema } from "./utils/flatten";

const sqlThemeSchema = flattenSchema(themeSchema).extend({
  tenant_id: z.string(),
});

const sqlLoginSchema = flattenSchema(loginSessionSchema).extend({
  tenant_id: z.string(),
  login_completed: z.number().optional().default(0),
});

const sqlConnectionSchema = flattenSchema(connectionSchema).extend({
  tenant_id: z.string(),
});

const sqlBrandingSchema = flattenSchema(brandingSchema).extend({
  tenant_id: z.string(),
});

const sqlApplicationSchema = z.object({
  ...applicationSchema.shape,
  tenant_id: z.string(),
  // The addons will be stored as JSON in a text column
  addons: z.string(),
  disable_sign_ups: z.number(),
  callbacks: z.string(),
  allowed_origins: z.string(),
  web_origins: z.string(),
  allowed_logout_urls: z.string(),
  allowed_clients: z.string(),
});

const sqlPromptSettingSchema = z.object({
  ...promptSettingSchema.shape,
  identifier_first: z.number(),
  password_first: z.number(),
  webauthn_platform_first_factor: z.number(),
  tenant_id: z.string(),
});

export const sqlUserSchema = z.object({
  ...userSchema.shape,
  email_verified: z.number(),
  is_social: z.number(),
  app_metadata: z.string(),
  user_metadata: z.string(),
  tenant_id: z.string(),
});

const sqlHookSchema = z.object({
  tenant_id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  hook_id: z.string(),
  trigger_id: z.string(),
  priority: z.number().optional().nullable(),
  enabled: z.number(),
  synchronous: z.number(),
  url: z.string().optional().nullable(),
  form_id: z.string().optional().nullable(),
});

const sqlEmailProvidersSchema = z.object({
  ...emailProviderSchema.shape,
  tenant_id: z.string(),
  // Store the credentials as JSON in a text column
  credentials: z.string(),
  settings: z.string(),
  enabled: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

const sqlSessionSchema = z.object({
  ...sessionSchema.shape,
  tenant_id: z.string(),
  device: z.string(),
  clients: z.string(),
});

const sqlRefreshTokensSchema = z.object({
  ...refreshTokenSchema.shape,
  tenant_id: z.string(),
  device: z.string(),
  resource_servers: z.string(),
  rotating: z.number(),
});

const sqlCustomDomainSchema = z.object({
  ...customDomainSchema.shape,
  primary: z.number(),
  tenant_id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const sqlFormSchema = z.object({
  ...formSchema.shape,
  tenant_id: z.string(),
  // Store complex data as JSON strings
  nodes: z.string().optional().default("[]"),
  start: z.string().optional().default("{}"),
  ending: z.string().optional().default("{}"),
});

// New SQL schemas
const sqlResourceServerSchema = z.object({
  ...resourceServerSchema.shape,
  tenant_id: z.string(),
  // Store complex structures as JSON
  scopes: z.string().optional().default("[]"),
  options: z.string().optional().default("{}"),
  // Store booleans as integers in SQL
  skip_consent_for_verifiable_first_party_clients: z.number().optional(),
  allow_offline_access: z.number().optional(),
});

const sqlRuleSchema = z.object({
  ...ruleSchema.shape,
  tenant_id: z.string(),
  // Store booleans as integers in SQL
  enabled: z.number().optional(),
});

const sqlPermissionSchema = z.object({
  id: z.string(),
  ...permissionSchema.shape,
  tenant_id: z.string(),
  // Store sources as JSON array
  sources: z.string().optional(),
});

export interface Database {
  applications: z.infer<typeof sqlApplicationSchema>;
  branding: z.infer<typeof sqlBrandingSchema>;
  codes: Code & { tenant_id: string };
  connections: z.infer<typeof sqlConnectionSchema>;
  custom_domains: z.infer<typeof sqlCustomDomainSchema>;
  email_providers: z.infer<typeof sqlEmailProvidersSchema>;
  forms: z.infer<typeof sqlFormSchema>;
  hooks: z.infer<typeof sqlHookSchema>;
  keys: SigningKey & { created_at: string };
  login_sessions: z.infer<typeof sqlLoginSchema>;
  logs: SqlLog;
  passwords: Password & { tenant_id: string };
  prompt_settings: z.infer<typeof sqlPromptSettingSchema>;
  refresh_tokens: z.infer<typeof sqlRefreshTokensSchema>;
  users: z.infer<typeof sqlUserSchema>;
  sessions: z.infer<typeof sqlSessionSchema>;
  tenants: Tenant;
  themes: z.infer<typeof sqlThemeSchema>;
  // New entities
  resource_servers: z.infer<typeof sqlResourceServerSchema>;
  rules: z.infer<typeof sqlRuleSchema>;
  permissions: z.infer<typeof sqlPermissionSchema>;
}
