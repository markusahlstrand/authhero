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
  organizationSchema,
  Password,
  promptSettingSchema,
  refreshTokenSchema,
  sessionSchema,
  SigningKey,
  Tenant,
  themeSchema,
  userSchema,
  resourceServerSchema,
  roleSchema,
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

export const sqlResourceServerSchema = z
  .object({
    ...resourceServerSchema.shape,
    tenant_id: z.string(),
    scopes: z.string().optional().default("[]"),
    options: z.string().optional().default("{}"),
    // Store booleans as integers in SQL
    skip_consent_for_verifiable_first_party_clients: z.number().optional(),
    allow_offline_access: z.number().optional(),
    // Handle verification_key as snake_case in database but verificationKey in interface
    verification_key: z.string().optional(),
    // Timestamp fields
    created_at: z.string(),
    updated_at: z.string(),
  })
  .omit({ verificationKey: true });

export const sqlRoleSchema = z.object({
  ...roleSchema.shape,
  tenant_id: z.string(),
  // Timestamp fields
  created_at: z.string(),
  updated_at: z.string(),
});

export const sqlRolePermissionSchema = z.object({
  tenant_id: z.string(),
  role_id: z.string(),
  resource_server_identifier: z.string(),
  permission_name: z.string(),
  created_at: z.string(),
});

export const sqlUserPermissionSchema = z.object({
  tenant_id: z.string(),
  user_id: z.string(),
  resource_server_identifier: z.string(),
  permission_name: z.string(),
  created_at: z.string(),
});

export const sqlUserRoleSchema = z.object({
  tenant_id: z.string(),
  user_id: z.string(),
  role_id: z.string(),
  created_at: z.string(),
});

export const sqlOrganizationSchema = z.object({
  ...organizationSchema.shape,
  tenant_id: z.string(),
  branding: z.string().optional().default("{}"),
  metadata: z.string().optional().default("{}"),
  enabled_connections: z.string().optional().default("[]"),
  token_quota: z.string().optional().default("{}"),
  created_at: z.string(),
  updated_at: z.string(),
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
  resource_servers: z.infer<typeof sqlResourceServerSchema>;
  role_permissions: z.infer<typeof sqlRolePermissionSchema>;
  user_permissions: z.infer<typeof sqlUserPermissionSchema>;
  user_roles: z.infer<typeof sqlUserRoleSchema>;
  roles: z.infer<typeof sqlRoleSchema>;
  organizations: z.infer<typeof sqlOrganizationSchema>;
}
