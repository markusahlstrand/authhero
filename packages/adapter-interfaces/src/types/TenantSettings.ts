import { z } from "@hono/zod-openapi";

// Based on Auth0 Management API v2 Tenant Settings
// https://auth0.com/docs/api/management/v2/tenants/tenant-settings-route

export const tenantSettingsSchema = z.object({
  // Session settings
  idle_session_lifetime: z.number().optional(),
  session_lifetime: z.number().optional(),
  session_cookie: z
    .object({
      mode: z.enum(["persistent", "non-persistent"]).optional(),
    })
    .optional(),

  // MFA settings
  enable_client_connections: z.boolean().optional(),

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
      allow_legacy_delegation_grant_types: z.boolean().optional(),
      allow_legacy_ro_grant_types: z.boolean().optional(),
      allow_legacy_tokeninfo_endpoint: z.boolean().optional(),
      disable_clickjack_protection_headers: z.boolean().optional(),
      enable_apis_section: z.boolean().optional(),
      enable_client_connections: z.boolean().optional(),
      enable_custom_domain_in_emails: z.boolean().optional(),
      enable_dynamic_client_registration: z.boolean().optional(),
      enable_idtoken_api2: z.boolean().optional(),
      enable_legacy_logs_search_v2: z.boolean().optional(),
      enable_legacy_profile: z.boolean().optional(),
      enable_pipeline2: z.boolean().optional(),
      enable_public_signup_user_exists_error: z.boolean().optional(),
      use_scope_descriptions_for_consent: z.boolean().optional(),
      disable_management_api_sms_obfuscation: z.boolean().optional(),
      enable_adfs_waad_email_verification: z.boolean().optional(),
      revoke_refresh_token_grant: z.boolean().optional(),
      dashboard_log_streams_next: z.boolean().optional(),
      dashboard_insights_view: z.boolean().optional(),
      disable_fields_map_fix: z.boolean().optional(),
      mfa_show_factor_list_on_enrollment: z.boolean().optional(),
    })
    .optional(),

  // Additional settings
  friendly_name: z.string().optional(),
  picture_url: z.string().optional(),
  support_email: z.string().optional(),
  support_url: z.string().optional(),

  // Sandbox settings
  sandbox_version: z.string().optional(),
  sandbox_versions_available: z.array(z.string()).optional(),

  // Change password settings
  change_password: z
    .object({
      enabled: z.boolean(),
      html: z.string(),
    })
    .optional(),

  // Guardian MFA settings
  guardian_mfa_page: z
    .object({
      enabled: z.boolean(),
      html: z.string(),
    })
    .optional(),

  // Default audience
  default_audience: z.string().optional(),

  // Default directory
  default_organization: z.string().optional(),

  // Session management
  sessions: z
    .object({
      oidc_logout_prompt_enabled: z.boolean().optional(),
    })
    .optional(),
});

export type TenantSettings = z.infer<typeof tenantSettingsSchema>;
