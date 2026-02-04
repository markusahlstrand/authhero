import { z } from "@hono/zod-openapi";
import {
  flowSchema,
  brandingSchema,
  clientSchema,
  Code,
  connectionSchema,
  customDomainSchema,
  emailProviderSchema,
  formSchema,
  loginSessionSchema,
  logSchema,
  organizationSchema,
  promptSettingSchema,
  refreshTokenSchema,
  rolePermissionSchema,
  sessionSchema,
  SigningKey,
  tenantSchema,
  themeSchema,
  userPermissionSchema,
  userRoleSchema,
  userSchema,
  resourceServerSchema,
  roleSchema,
} from "@authhero/adapter-interfaces";
import { flattenSchema } from "./utils/flatten";

const sqlThemeSchema = flattenSchema(themeSchema).extend({
  tenant_id: z.string(),
});

const sqlLoginSchema = flattenSchema(loginSessionSchema)
  .omit({
    created_at: true,
    updated_at: true,
    expires_at: true,
  })
  .extend({
    tenant_id: z.string(),
    state: z.string().optional().default("pending"),
    state_data: z.string().optional(),
    failure_reason: z.string().optional(),
    user_id: z.string().optional(),
    // Date fields - bigint timestamps with _ts suffix
    created_at_ts: z.number(),
    updated_at_ts: z.number(),
    expires_at_ts: z.number(),
  });

const sqlConnectionSchema = flattenSchema(connectionSchema).extend({
  tenant_id: z.string(),
  // Store booleans as integers in SQL
  is_system: z.number().optional(),
});

const sqlBrandingSchema = flattenSchema(brandingSchema).extend({
  tenant_id: z.string(),
});

const sqlUniversalLoginTemplateSchema = z.object({
  tenant_id: z.string(),
  body: z.string(),
  created_at_ts: z.number(),
  updated_at_ts: z.number(),
});

const sqlCustomTextSchema = z.object({
  tenant_id: z.string(),
  prompt: z.string(),
  language: z.string(),
  custom_text: z.string(), // JSON string
  created_at_ts: z.number(),
  updated_at_ts: z.number(),
});

const sqlPromptSettingSchema = z.object({
  ...promptSettingSchema.shape,
  identifier_first: z.number(),
  password_first: z.number(),
  webauthn_platform_first_factor: z.number(),
  tenant_id: z.string(),
});

const sqlPasswordSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  tenant_id: z.string(),
  password: z.string(),
  algorithm: z.enum(["bcrypt", "argon2id"]),
  created_at: z.string(),
  updated_at: z.string(),
  is_current: z.number(),
});

export const sqlUserSchema = z.object({
  ...userSchema.shape,
  email_verified: z.number(),
  phone_verified: z.number().optional().nullable(),
  is_social: z.number(),
  app_metadata: z.string(),
  user_metadata: z.string(),
  address: z.string().optional().nullable(),
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

const sqlSessionSchema = sessionSchema
  .omit({
    created_at: true,
    updated_at: true,
    expires_at: true,
    idle_expires_at: true,
    authenticated_at: true,
    last_interaction_at: true,
    used_at: true,
    revoked_at: true,
    device: true,
    clients: true,
  })
  .extend({
    tenant_id: z.string(),
    device: z.string(),
    clients: z.string(),
    // Date fields - bigint timestamps with _ts suffix
    created_at_ts: z.number(),
    updated_at_ts: z.number(),
    expires_at_ts: z.number().nullable().optional(),
    idle_expires_at_ts: z.number().nullable().optional(),
    authenticated_at_ts: z.number().nullable().optional(),
    last_interaction_at_ts: z.number().nullable().optional(),
    used_at_ts: z.number().nullable().optional(),
    revoked_at_ts: z.number().nullable().optional(),
  });

const sqlRefreshTokensSchema = refreshTokenSchema
  .omit({
    created_at: true,
    expires_at: true,
    idle_expires_at: true,
    last_exchanged_at: true,
    device: true,
    resource_servers: true,
    rotating: true,
  })
  .extend({
    tenant_id: z.string(),
    device: z.string(),
    resource_servers: z.string(),
    rotating: z.number(),
    // Date fields - bigint timestamps with _ts suffix
    created_at_ts: z.number(),
    expires_at_ts: z.number().nullable().optional(),
    idle_expires_at_ts: z.number().nullable().optional(),
    last_exchanged_at_ts: z.number().nullable().optional(),
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

const sqlFlowSchema = z.object({
  ...flowSchema.shape,
  tenant_id: z.string(),
  // Store complex data as JSON strings
  actions: z.string().optional().default("[]"),
});

const sqlLogSchema = z.object({
  ...logSchema.shape,
  id: z.string().optional(), // Legacy field, will be dropped
  tenant_id: z.string(),
  // Override fields that need different types in SQL
  isMobile: z.number().optional(),
  scope: z.string().optional(), // Stored as comma-separated string in SQL
  auth0_client: z.string().optional(), // Stored as JSON string in SQL
  details: z.string().optional(), // Stored as JSON string in SQL
  session_connection: z.string().optional(),
  // Location info stored as separate columns for filtering
  country_code: z.string().optional(),
  city_name: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  time_zone: z.string().optional(),
  continent_code: z.string().optional(),
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
    is_system: z.number().optional(),
    // Store metadata as JSON string in SQL
    metadata: z.string().optional(),
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
  // Store booleans as integers in SQL
  is_system: z.number().optional(),
  // Store metadata as JSON string in SQL
  metadata: z.string().optional(),
  // Timestamp fields
  created_at: z.string(),
  updated_at: z.string(),
});

// Tenant schema now includes settings fields (merged from tenant_settings)
export const sqlTenantSchema = z.object({
  ...tenantSchema.shape,
});

export const sqlClientGrantSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  client_id: z.string(),
  audience: z.string(),
  scope: z.string().optional().default("[]"), // JSON array string (stored as text)
  organization_usage: z.string().optional(),
  allow_any_organization: z.number().optional(), // Convert boolean to integer for SQL storage
  is_system: z.number().optional(), // Convert boolean to integer for SQL storage
  subject_type: z.string().optional(),
  authorization_details_types: z.string().optional().default("[]"), // JSON array string (stored as text)
  created_at: z.string(),
  updated_at: z.string(),
});

export const sqlRolePermissionSchema = z.object({
  ...rolePermissionSchema.shape,
  tenant_id: z.string(),
});

export const sqlUserPermissionSchema = z.object({
  ...userPermissionSchema.shape,
});

export const sqlUserRoleSchema = z.object({
  ...userRoleSchema.shape,
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

export const sqlUserOrganizationSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  user_id: z.string(),
  organization_id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const sqlInviteSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  organization_id: z.string(),
  inviter: z.string(), // JSON string
  invitee: z.string(), // JSON string
  client_id: z.string(),
  connection_id: z.string().optional().nullable(),
  invitation_url: z.string(),
  created_at: z.string(),
  expires_at: z.string(),
  app_metadata: z.string().optional().default("{}"), // JSON string
  user_metadata: z.string().optional().default("{}"), // JSON string
  roles: z.string().optional().default("[]"), // JSON array string
  ticket_id: z.string().optional().nullable(),
  ttl_sec: z.number().optional(),
  send_invitation_email: z.number().optional().default(1), // boolean as int
});

const sqlClientSchema = z.object({
  ...clientSchema.shape,
  tenant_id: z.string(),
  // Convert boolean fields to integers for SQL storage
  global: z.number(),
  is_first_party: z.number(),
  oidc_conformant: z.number(),
  auth0_conformant: z.number(),
  sso: z.number(),
  sso_disabled: z.number(),
  cross_origin_authentication: z.number(),
  custom_login_page_on: z.number(),
  require_pushed_authorization_requests: z.number(),
  require_proof_of_possession: z.number(),
  // Convert array/object fields to JSON strings for SQL storage
  callbacks: z.string(),
  allowed_origins: z.string(),
  web_origins: z.string(),
  client_aliases: z.string(),
  allowed_clients: z.string(),
  connections: z.string(),
  allowed_logout_urls: z.string(),
  session_transfer: z.string(),
  oidc_logout: z.string(),
  grant_types: z.string(),
  jwt_configuration: z.string(),
  signing_keys: z.string(),
  encryption_key: z.string(),
  addons: z.string(),
  client_metadata: z.string(),
  mobile: z.string(),
  native_social_login: z.string(),
  refresh_token: z.string(),
  default_organization: z.string(),
  client_authentication_methods: z.string(),
  signed_request_object: z.string(),
  token_quota: z.string(),
});

export interface Database {
  flows: z.infer<typeof sqlFlowSchema>;
  branding: z.infer<typeof sqlBrandingSchema>;
  clients: z.infer<typeof sqlClientSchema>;
  client_grants: z.infer<typeof sqlClientGrantSchema>;
  codes: Code & { tenant_id: string };
  connections: z.infer<typeof sqlConnectionSchema>;
  custom_domains: z.infer<typeof sqlCustomDomainSchema>;
  email_providers: z.infer<typeof sqlEmailProvidersSchema>;
  forms: z.infer<typeof sqlFormSchema>;
  hooks: z.infer<typeof sqlHookSchema>;
  keys: SigningKey & { created_at: string };
  login_sessions: z.infer<typeof sqlLoginSchema>;
  logs: z.infer<typeof sqlLogSchema>;
  passwords: z.infer<typeof sqlPasswordSchema>;
  prompt_settings: z.infer<typeof sqlPromptSettingSchema>;
  refresh_tokens: z.infer<typeof sqlRefreshTokensSchema>;
  users: z.infer<typeof sqlUserSchema>;
  sessions: z.infer<typeof sqlSessionSchema>;
  tenants: z.infer<typeof sqlTenantSchema>;
  themes: z.infer<typeof sqlThemeSchema>;
  resource_servers: z.infer<typeof sqlResourceServerSchema>;
  role_permissions: z.infer<typeof sqlRolePermissionSchema>;
  user_permissions: z.infer<typeof sqlUserPermissionSchema>;
  user_roles: z.infer<typeof sqlUserRoleSchema>;
  roles: z.infer<typeof sqlRoleSchema>;
  organizations: z.infer<typeof sqlOrganizationSchema>;
  user_organizations: z.infer<typeof sqlUserOrganizationSchema>;
  invites: z.infer<typeof sqlInviteSchema>;
  universal_login_templates: z.infer<typeof sqlUniversalLoginTemplateSchema>;
  custom_text: z.infer<typeof sqlCustomTextSchema>;
}
