import { z } from "@hono/zod-openapi";
import { attackProtectionSchema } from "./AttackProtection";

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

  // Anchor client used for tenant-level flows that aren't tied to a specific
  // application (e.g. /connect/start DCR consent). When unset, /connect/start
  // falls back to the first available client. Roughly analogous to Auth0's
  // "Default App" / Global Client.
  default_client_id: z.string().optional(),

  // Advanced settings
  enabled_locales: z.array(z.string()).optional(),
  default_directory: z.string().optional(),
  error_page: z
    .object({
      html: z.string().optional(),
      show_log_link: z.boolean().optional(),
      url: z.string().optional(),
    })
    .nullish(),

  // Flags
  flags: z
    .object({
      allow_changing_enable_sso: z.boolean().optional(),
      allow_legacy_delegation_grant_types: z.boolean().optional(),
      allow_legacy_ro_grant_types: z.boolean().optional(),
      allow_legacy_tokeninfo_endpoint: z.boolean().optional(),
      change_pwd_flow_v1: z.boolean().optional(),
      // Auth0 tenant flag. When enabled, the authorization server accepts
      // Client ID Metadata Documents (CIMD): an https URL as `client_id`,
      // fetched and validated at request time. Advertised via
      // `client_id_metadata_document_supported` in the AS metadata.
      client_id_metadata_document_registration: z.boolean().optional(),
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
      // AuthHero extensions — not part of Auth0. Auth0 only supports Open DCR
      // and relies on tenant ACLs/rate limits; we implement RFC 7591 initial
      // access tokens and a per-tenant grant-type allowlist.
      dcr_require_initial_access_token: z.boolean().optional(),
      dcr_allowed_grant_types: z.array(z.string()).optional(),
      // Per-tenant allowlist of fully-qualified http origins (scheme + host
      // + port, no path) that may be used as `return_to` / `domain` on
      // `/connect/start` despite not being loopback. Off by default.
      allow_http_return_to: z
        .array(
          z.string().refine(
            (s) => {
              try {
                const u = new URL(s);
                return (
                  u.protocol === "http:" &&
                  (u.pathname === "" || u.pathname === "/") &&
                  !u.search &&
                  !u.hash &&
                  s === u.origin
                );
              } catch {
                return false;
              }
            },
            {
              message:
                "must be a fully-qualified http origin (scheme + host + port, no path)",
            },
          ),
        )
        .optional(),
      enable_idtoken_api2: z.boolean().optional(),
      enable_legacy_logs_search_v2: z.boolean().optional(),
      enable_legacy_profile: z.boolean().optional(),
      enable_pipeline2: z.boolean().optional(),
      enable_public_signup_user_exists_error: z.boolean().optional(),
      enable_sso: z.boolean().optional(),
      enforce_client_authentication_on_passwordless_start: z
        .boolean()
        .optional(),
      genai_trial: z.boolean().optional(),
      improved_signup_bot_detection_in_classic: z.boolean().optional(),
      mfa_show_factor_list_on_enrollment: z.boolean().optional(),
      no_disclose_enterprise_connections: z.boolean().optional(),
      remove_alg_from_jwks: z.boolean().optional(),
      revoke_refresh_token_grant: z.boolean().optional(),
      trust_azure_adfs_email_verified_connection_property: z
        .boolean()
        .optional(),
      use_scope_descriptions_for_consent: z.boolean().optional(),
      // When enabled, tenant-level permissions will be inherited when users request
      // organization-scoped tokens. This allows users with tenant-level roles to maintain
      // their permissions when accessing resources in an organization context.
      inherit_global_permissions_in_organizations: z.boolean().optional(),
      // AuthHero extension — not part of Auth0. When enabled, the access
      // token's `scope` claim is restricted to scopes actually defined on
      // the targeted resource server (plus standard OIDC scopes). Default
      // (false/undefined) preserves Auth0's legacy passthrough: every
      // requested scope is echoed into the token verbatim. Opt in for
      // tenants that want defense-in-depth against scope-string forgery.
      restrict_undefined_scopes: z.boolean().optional(),
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
          client_credentials: z.record(z.string(), z.any()).optional(),
        })
        .optional(),
      organizations: z
        .object({
          client_credentials: z.record(z.string(), z.any()).optional(),
        })
        .optional(),
    })
    .nullish(),

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
    .nullish(),

  // Authorization settings
  pushed_authorization_requests_supported: z.boolean().optional(),
  authorization_response_iss_parameter_supported: z.boolean().optional(),

  // Deployment / provisioning. Identifies how the tenant runs.
  //
  // `shared` — the tenant runs on the same authhero deployment as every other
  // shared tenant (the historical default).
  //
  // `wfp` — the tenant is provisioned as its own Cloudflare Worker in a
  // dispatch namespace, fronted by the proxy dispatcher. `bundle_configuration`
  // identifies the worker image (e.g. `authhero-drizzle-d1`),
  // `worker_version` pins the release within that configuration, and
  // `storage_kind` plus `d1_database_id` determine the data backend the
  // tenant worker is bound to.
  //
  // `provisioning_state` tracks the async provision flow for `wfp` tenants.
  // Shared tenants are `ready` immediately.
  deployment_type: z.enum(["shared", "wfp"]).default("shared").optional(),
  provisioning_state: z
    .enum(["pending", "ready", "failed"])
    .default("ready")
    .optional(),
  provisioning_error: z.string().max(2048).optional(),
  provisioning_state_changed_at: z.string().optional(),
  bundle_configuration: z.string().max(64).optional(),
  worker_version: z.string().max(64).optional(),
  worker_script_name: z.string().max(255).optional(),
  storage_kind: z
    .enum(["own_d1", "existing_d1", "shared_planetscale"])
    .optional(),
  d1_database_id: z.string().max(64).optional(),

  // Attack-protection config (singleton, exposed via /api/v2/attack-protection)
  attack_protection: attackProtectionSchema.optional(),

  // Guardian MFA Factors configuration (internal storage, exposed via /guardian API)
  mfa: z
    .object({
      // MFA policy: "never" = MFA disabled, "always" = MFA required for all logins
      policy: z.enum(["never", "always"]).default("never").optional(),
      // Factor states
      factors: z
        .object({
          sms: z.boolean().default(false),
          otp: z.boolean().default(false),
          email: z.boolean().default(false),
          push_notification: z.boolean().default(false),
          webauthn_roaming: z.boolean().default(false),
          webauthn_platform: z.boolean().default(false),
          recovery_code: z.boolean().default(false),
          duo: z.boolean().default(false),
        })
        .optional(),
      // SMS provider configuration
      sms_provider: z
        .object({
          provider: z
            .enum(["twilio", "vonage", "aws_sns", "phone_message_hook"])
            .optional(),
        })
        .optional(),
      // Twilio-specific configuration
      twilio: z
        .object({
          sid: z.string().optional(),
          auth_token: z.string().optional(),
          from: z.string().optional(),
          messaging_service_sid: z.string().optional(),
        })
        .optional(),
      // Phone message configuration (custom)
      phone_message: z
        .object({
          message: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

export const tenantSchema = z
  .object({
    created_at: z
      .string()
      .nullable()
      .transform((val) => val ?? ""),
    updated_at: z
      .string()
      .nullable()
      .transform((val) => val ?? ""),
  })
  .extend(tenantInsertSchema.shape)
  .extend({
    id: z.string(),
    // Computed server-side: true when this tenant is the deployment's control
    // plane (either `multiTenancyConfig.controlPlaneTenantId` matches the
    // tenant id, or no multi-tenancy config is set — i.e. single-tenant
    // deployment). Not persisted; ignored on writes.
    is_control_plane: z.boolean().optional(),
  });

export type Tenant = z.infer<typeof tenantSchema>;
