import { z } from "@hono/zod-openapi";

export const tenantInsertSchema = z.object({
  id: z.string().optional(),

  // Basic settings
  audience: z.string(),
  friendly_name: z.string(), // Required - replaces the old 'name' field
  picture_url: z.string().optional(),
  support_email: z.string().optional(),
  support_url: z.string().optional(),
  sender_email: z.string().email(),
  sender_name: z.string(),

  // Tenant Settings fields (merged from TenantSettings)
  // Session settings
  session_lifetime: z.number().optional(),
  idle_session_lifetime: z.number().optional(),
  ephemeral_session_lifetime: z.number().optional(),
  idle_ephemeral_session_lifetime: z.number().optional(),
  session_cookie: z
    .object({
      mode: z.enum(["persistent", "non-persistent"]).optional(),
    })
    .optional(),

  // Logout settings
  allowed_logout_urls: z.array(z.string()).optional(),

  // Universal Login settings
  default_redirection_uri: z.string().optional(),

  // Advanced settings
  enabled_locales: z.array(z.string()).optional(),
  default_directory: z.string().optional(),
  error_page: z
    .object({
      html: z.string().optional(),
      show_log_link: z.boolean().optional(),
      url: z.string().optional(),
    })
    .optional(),

  // Flags
  flags: z
    .object({
      allow_changing_enable_sso: z.boolean().optional(),
      allow_legacy_delegation_grant_types: z.boolean().optional(),
      allow_legacy_ro_grant_types: z.boolean().optional(),
      allow_legacy_tokeninfo_endpoint: z.boolean().optional(),
      change_pwd_flow_v1: z.boolean().optional(),
      custom_domains_provisioning: z.boolean().optional(),
      dashboard_insights_view: z.boolean().optional(),
      dashboard_log_streams_next: z.boolean().optional(),
      disable_clickjack_protection_headers: z.boolean().optional(),
      disable_fields_map_fix: z.boolean().optional(),
      disable_impersonation: z.boolean().optional(),
      disable_management_api_sms_obfuscation: z.boolean().optional(),
      enable_adfs_waad_email_verification: z.boolean().optional(),
      enable_apis_section: z.boolean().optional(),
      enable_client_connections: z.boolean().optional(),
      enable_custom_domain_in_emails: z.boolean().optional(),
      enable_dynamic_client_registration: z.boolean().optional(),
      enable_idtoken_api2: z.boolean().optional(),
      enable_legacy_logs_search_v2: z.boolean().optional(),
      enable_legacy_profile: z.boolean().optional(),
      enable_pipeline2: z.boolean().optional(),
      enable_public_signup_user_exists_error: z.boolean().optional(),
      enable_sso: z.boolean().optional(),
      enforce_client_authentication_on_passwordless_start: z.boolean().optional(),
      genai_trial: z.boolean().optional(),
      improved_signup_bot_detection_in_classic: z.boolean().optional(),
      mfa_show_factor_list_on_enrollment: z.boolean().optional(),
      no_disclose_enterprise_connections: z.boolean().optional(),
      remove_alg_from_jwks: z.boolean().optional(),
      revoke_refresh_token_grant: z.boolean().optional(),
      trust_azure_adfs_email_verified_connection_property: z.boolean().optional(),
      use_scope_descriptions_for_consent: z.boolean().optional(),
    })
    .optional(),

  // Sandbox settings
  sandbox_version: z.string().optional(),
  legacy_sandbox_version: z.string().optional(),
  sandbox_versions_available: z.array(z.string()).optional(),

  // Change password settings
  change_password: z
    .object({
      enabled: z.boolean().optional(),
      html: z.string().optional(),
    })
    .optional(),

  // Guardian MFA settings
  guardian_mfa_page: z
    .object({
      enabled: z.boolean().optional(),
      html: z.string().optional(),
    })
    .optional(),

  // Device flow settings
  device_flow: z
    .object({
      charset: z.enum(["base20", "digits"]).optional(),
      mask: z.string().max(20).optional(),
    })
    .optional(),

  // Default token quota
  default_token_quota: z
    .object({
      clients: z
        .object({
          client_credentials: z.object({}).optional(),
        })
        .optional(),
      organizations: z
        .object({
          client_credentials: z.object({}).optional(),
        })
        .optional(),
    })
    .optional(),

  // Default audience
  default_audience: z.string().optional(),

  // Default organization
  default_organization: z.string().optional(),

  // Session management
  sessions: z
    .object({
      oidc_logout_prompt_enabled: z.boolean().optional(),
    })
    .optional(),

  // OIDC logout settings
  oidc_logout: z
    .object({
      rp_logout_end_session_endpoint_discovery: z.boolean().optional(),
    })
    .optional(),

  // Organization settings
  allow_organization_name_in_authentication_api: z.boolean().optional(),

  // MFA settings
  customize_mfa_in_postlogin_action: z.boolean().optional(),

  // ACR values
  acr_values_supported: z.array(z.string()).optional(),

  // mTLS settings
  mtls: z
    .object({
      enable_endpoint_aliases: z.boolean().optional(),
    })
    .optional(),

  // Authorization settings
  pushed_authorization_requests_supported: z.boolean().optional(),
  authorization_response_iss_parameter_supported: z.boolean().optional(),
});

export const tenantSchema = z.object({
  created_at: z.string().transform((val) => (val === null ? "" : val)),
  updated_at: z.string().transform((val) => (val === null ? "" : val)),
  ...tenantInsertSchema.shape,
  id: z.string(),
});

export type Tenant = z.infer<typeof tenantSchema>;
