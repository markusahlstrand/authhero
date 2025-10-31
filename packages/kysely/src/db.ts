import { z } from "@hono/zod-openapi";
import {
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
  Password,
  promptSettingSchema,
  refreshTokenSchema,
  sessionSchema,
  SigningKey,
  themeSchema,
  userSchema,
  resourceServerSchema,
  roleSchema,
} from "@authhero/adapter-interfaces";
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

const sqlLogSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  type: logSchema.shape.type,
  date: z.string(),
  description: z.string().optional(),
  ip: z.string(),
  user_agent: z.string(),
  details: z.string().optional(),
  auth0_client: z.string().optional(),
  isMobile: z.number().optional(),
  user_id: z.string().optional(),
  user_name: z.string().optional(),
  connection: z.string().optional(),
  connection_id: z.string().optional(),
  client_id: z.string().optional(),
  client_name: z.string().optional(),
  audience: z.string().optional(),
  scope: z.string().optional(),
  strategy: z.string().optional(),
  strategy_type: z.string().optional(),
  hostname: z.string().optional(),
  session_connection: z.string().optional(),
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

// Tenant schema now includes settings fields (merged from tenant_settings)
export const sqlTenantSchema = z.object({
  // Base tenant fields
  id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  audience: z.string(),
  sender_email: z.string(),
  sender_name: z.string(),
  support_url: z.string().optional(),

  // Basic settings
  friendly_name: z.string(), // Required - replaces the old 'name' field
  picture_url: z.string().optional(),
  support_email: z.string().optional(),

  // Session settings
  session_lifetime: z.number().optional(),
  idle_session_lifetime: z.number().optional(),
  ephemeral_session_lifetime: z.number().optional(),
  idle_ephemeral_session_lifetime: z.number().optional(),
  session_cookie: z.string().optional(), // JSON

  // Logout settings
  allowed_logout_urls: z.string().optional(), // JSON array

  // Universal Login settings
  default_redirection_uri: z.string().optional(),

  // Advanced settings
  enabled_locales: z.string().optional(), // JSON array
  default_directory: z.string().optional(),
  error_page: z.string().optional(), // JSON

  // Flags
  flags: z.string().optional(), // JSON

  // Sandbox settings
  sandbox_version: z.string().optional(),
  legacy_sandbox_version: z.string().optional(),
  sandbox_versions_available: z.string().optional(), // JSON array

  // Change password settings
  change_password: z.string().optional(), // JSON

  // Guardian MFA settings
  guardian_mfa_page: z.string().optional(), // JSON

  // Device flow settings
  device_flow: z.string().optional(), // JSON

  // Default token quota
  default_token_quota: z.string().optional(), // JSON

  // Default audience & organization
  default_audience: z.string().optional(),
  default_organization: z.string().optional(),

  // Session management
  sessions: z.string().optional(), // JSON

  // OIDC logout settings
  oidc_logout: z.string().optional(), // JSON

  // Organization settings
  allow_organization_name_in_authentication_api: z.number().optional(), // boolean as int

  // MFA settings
  customize_mfa_in_postlogin_action: z.number().optional(), // boolean as int

  // ACR values
  acr_values_supported: z.string().optional(), // JSON array

  // mTLS settings
  mtls: z.string().optional(), // JSON

  // Authorization settings
  pushed_authorization_requests_supported: z.number().optional(), // boolean as int
  authorization_response_iss_parameter_supported: z.number().optional(), // boolean as int
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
  organization_id: z.string(),
  created_at: z.string(),
});

export const sqlUserRoleSchema = z.object({
  tenant_id: z.string(),
  user_id: z.string(),
  role_id: z.string(),
  organization_id: z.string(),
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
  passwords: Password & { tenant_id: string };
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
}
