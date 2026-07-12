import { z } from "@hono/zod-openapi";
import { nanoid } from "nanoid";

export const clientInsertSchema = z.object({
  client_id: z.string().optional().openapi({
    description:
      "ID of this client. Generated server-side if omitted (Auth0 behavior).",
  }),
  name: z.string().min(1).openapi({
    description:
      "Name of this client (min length: 1 character, does not allow < or >).",
  }),
  description: z.string().max(140).optional().openapi({
    description:
      "Free text description of this client (max length: 140 characters).",
  }),
  global: z.boolean().default(false).openapi({
    description:
      "Whether this is your global 'All Applications' client representing legacy tenant settings (true) or a regular client (false).",
  }),
  client_secret: z
    .string()
    .default(() => nanoid())
    .optional()
    .openapi({
      description: "Client secret (which you must not make public).",
    }),
  app_type: z
    .enum([
      "native",
      "spa",
      "regular_web",
      "non_interactive",
      "resource_server",
      "express_configuration",
      "rms",
      "box",
      "cloudbees",
      "concur",
      "dropbox",
      "mscrm",
      "echosign",
      "egnyte",
      "newrelic",
      "office365",
      "salesforce",
      "sentry",
      "sharepoint",
      "slack",
      "springcm",
      "zendesk",
      "zoom",
      "sso_integration",
      "oag",
    ])
    .default("regular_web")
    .optional()
    .openapi({
      description: "The type of application this client represents",
    }),
  logo_uri: z.string().url().optional().openapi({
    description:
      "URL of the logo to display for this client. Recommended size is 150x150 pixels.",
  }),
  is_first_party: z.boolean().default(true).openapi({
    description:
      "Whether this client is a first party client (true) or not (false). First-party clients skip the consent screen; third-party clients require explicit user consent for non-basic scopes.",
  }),
  oidc_conformant: z.boolean().default(true).openapi({
    description:
      "Whether this client conforms to strict OIDC specifications (true) or uses legacy features (false).",
  }),
  auth0_conformant: z.boolean().default(true).openapi({
    description:
      "Whether this client follows Auth0-compatible behavior (true) or strict OIDC behavior (false). When true, profile/email claims are included in the ID token when scopes are requested. When false, these claims are only available from the userinfo endpoint (strict OIDC 5.4 compliance).",
  }),
  callbacks: z.array(z.string()).default([]).optional().openapi({
    description:
      "Comma-separated list of URLs whitelisted for Auth0 to use as a callback to the client after authentication.",
  }),
  allowed_origins: z.array(z.string()).default([]).optional().openapi({
    description:
      "Comma-separated list of URLs allowed to make requests from JavaScript to Auth0 API (typically used with CORS). By default, all your callback URLs will be allowed. This field allows you to enter other origins if necessary. You can also use wildcards at the subdomain level (e.g., https://*.contoso.com). Query strings and hash information are not taken into account when validating these URLs.",
  }),
  web_origins: z.array(z.string()).default([]).optional().openapi({
    description:
      "Comma-separated list of allowed origins for use with Cross-Origin Authentication, Device Flow, and web message response mode.",
  }),
  client_aliases: z.array(z.string()).default([]).optional().openapi({
    description:
      "List of audiences/realms for SAML protocol. Used by the wsfed addon.",
  }),
  allowed_clients: z.array(z.string()).default([]).optional().openapi({
    description:
      "List of allow clients and API ids that are allowed to make delegation requests. Empty means all all your clients are allowed.",
  }),
  connections: z.array(z.string()).default([]).optional().openapi({
    description:
      "List of connection IDs enabled for this client. The order determines the display order on the login page.",
  }),
  allowed_logout_urls: z.array(z.string()).default([]).optional().openapi({
    description:
      "Comma-separated list of URLs that are valid to redirect to after logout from Auth0. Wildcards are allowed for subdomains.",
  }),
  session_transfer: z
    .record(z.string(), z.any())
    .default({})
    .optional()
    .openapi({
      description: "Native to Web SSO Configuration",
    }),
  oidc_logout: z
    .object({
      backchannel_logout_urls: z.array(z.string()).optional().openapi({
        description:
          "URLs that receive a signed OIDC Back-Channel Logout 1.0 logout token when a session this client participated in ends.",
      }),
      backchannel_logout_initiators: z
        .object({
          mode: z.enum(["all", "custom"]).optional().openapi({
            description:
              "Whether all session-end events initiate a backchannel logout (all) or only the selected_initiators (custom).",
          }),
          selected_initiators: z.array(z.string()).optional().openapi({
            description:
              "Logout initiators that trigger a backchannel logout when mode is custom (e.g. rp-logout, idp-logout, password-changed).",
          }),
        })
        .passthrough()
        .optional()
        .openapi({
          description:
            "Controls which session-end events initiate backchannel logout notifications. Stored for Auth0 compatibility; not yet enforced — all initiators currently notify.",
        }),
    })
    .passthrough()
    .default({})
    .optional()
    .openapi({
      description: "Configuration for OIDC backchannel logout",
    }),
  grant_types: z.array(z.string()).default([]).optional().openapi({
    description:
      "List of grant types supported for this application. Can include authorization_code, implicit, refresh_token, client_credentials, password, http://auth0.com/oauth/grant-type/password-realm, http://auth0.com/oauth/grant-type/mfa-oob, http://auth0.com/oauth/grant-type/mfa-otp, http://auth0.com/oauth/grant-type/mfa-recovery-code, urn:openid:params:grant-type:ciba, and urn:ietf:params:oauth:grant-type:device_code.",
  }),
  jwt_configuration: z
    .record(z.string(), z.any())
    .default({})
    .optional()
    .openapi({
      description: "Configuration related to JWTs for the client.",
    }),
  signing_keys: z
    .array(z.record(z.string(), z.any()))
    .default([])
    .optional()
    .openapi({
      description: "Signing certificates associated with this client.",
    }),
  encryption_key: z.record(z.string(), z.any()).default({}).optional().openapi({
    description: "Encryption used for WsFed responses with this client.",
  }),
  sso: z.boolean().default(false).openapi({
    description:
      "Applies only to SSO clients and determines whether Auth0 will handle Single Sign On (true) or whether the Identity Provider will (false).",
  }),
  sso_disabled: z.boolean().default(false).openapi({
    description:
      "Whether Single Sign On is disabled for this client. When true, existing SSO sessions will not be reused and users must authenticate every time.",
  }),
  cross_origin_authentication: z.boolean().default(false).openapi({
    description:
      "Whether this client can be used to make cross-origin authentication requests (true) or it is not allowed to make such requests (false).",
  }),
  cross_origin_loc: z.string().url().optional().openapi({
    description:
      "URL of the location in your site where the cross origin verification takes place for the cross-origin auth flow when performing Auth in your own domain instead of Auth0 hosted login page.",
  }),
  custom_login_page_on: z.boolean().default(false).openapi({
    description:
      "Whether a custom login page is to be used (true) or the default provided login page (false).",
  }),
  custom_login_page: z.string().optional().openapi({
    description: "The content (HTML, CSS, JS) of the custom login page.",
  }),
  custom_login_page_preview: z.string().optional().openapi({
    description:
      "The content (HTML, CSS, JS) of the custom login page. (Used on Previews)",
  }),
  form_template: z.string().optional().openapi({
    description: "HTML form template to be used for WS-Federation.",
  }),
  addons: z.record(z.string(), z.any()).default({}).optional().openapi({
    description:
      "Addons enabled for this client and their associated configurations.",
  }),
  token_endpoint_auth_method: z
    .enum([
      "none",
      "client_secret_post",
      "client_secret_basic",
      "client_secret_jwt",
      "private_key_jwt",
    ])
    .default("client_secret_basic")
    .optional()
    .openapi({
      description:
        "Defines the requested authentication method for the token endpoint. `none` (public client), `client_secret_post` / `client_secret_basic` (HTTP POST / Basic), `client_secret_jwt` (RFC 7523 HMAC assertion using client_secret), or `private_key_jwt` (RFC 7523 asymmetric assertion verified against the client's `jwks` / `jwks_uri`).",
    }),
  client_metadata: z
    .record(z.string(), z.string().max(255))
    .default({})
    .optional()
    .openapi({
      description:
        'Metadata associated with the client, in the form of an object with string values (max 255 chars). Maximum of 10 metadata properties allowed. Field names (max 255 chars) are alphanumeric and may only include the following special characters: :,-+=_*?"/()\u003c\u003e@ [Tab][Space]',
    }),
  hide_sign_up_disabled_error: z.boolean().default(false).optional().openapi({
    description:
      "Enumeration-safe variant of the connection-level `disable_signup` flag. When a signup is blocked by the password connection and this is true, the identifier screen does not reveal that an email is unknown — it advances to the OTP/password challenge as if the account existed and fails at credential check. Mitigates email enumeration at the cost of UX: users without an account see a generic credential failure instead of an explicit signup-disabled message.",
  }),
  mobile: z.record(z.string(), z.any()).default({}).optional().openapi({
    description: "Additional configuration for native mobile apps.",
  }),
  initiate_login_uri: z.string().url().optional().openapi({
    description: "Initiate login uri, must be https",
  }),
  native_social_login: z.record(z.string(), z.any()).default({}).optional(),
  refresh_token: z
    .object({
      rotation_type: z.enum(["rotating", "non-rotating"]).optional().openapi({
        description:
          "Whether refresh tokens for this client are rotated on every exchange (Auth0 'rotating' behavior) or kept stable (legacy non-rotating). Defaults to 'non-rotating' when unset.",
      }),
      leeway: z.number().int().min(0).max(600).optional().openapi({
        description:
          "Seconds after a parent token's first rotation during which presenting it again still mints a fresh sibling child instead of triggering reuse-detection. Defaults to 30s when unset.",
      }),
      // Auth0-compatible fields. Listed explicitly (rather than using
      // .passthrough()) so they survive parse cycles AND keep type info,
      // without tripping dts-bundle-generator's handling of zod's
      // `objectInputType`. Not yet honored by the engine — added so values
      // round-trip cleanly when migrating tenants from Auth0.
      expiration_type: z.enum(["expiring", "non-expiring"]).optional().openapi({
        description: "Auth0-compatible: whether refresh tokens expire.",
      }),
      token_lifetime: z.number().int().min(0).optional().openapi({
        description:
          "Auth0-compatible: refresh-token absolute lifetime in seconds.",
      }),
      infinite_token_lifetime: z.boolean().optional().openapi({
        description:
          "Auth0-compatible: when true, refresh tokens have no absolute expiry.",
      }),
      idle_token_lifetime: z.number().int().min(0).optional().openapi({
        description:
          "Auth0-compatible: refresh-token idle (sliding) lifetime in seconds.",
      }),
      infinite_idle_token_lifetime: z.boolean().optional().openapi({
        description:
          "Auth0-compatible: when true, refresh tokens have no idle expiry.",
      }),
    })
    .default({})
    .optional()
    .openapi({
      description: "Refresh token configuration",
    }),
  default_organization: z
    .record(z.string(), z.any())
    .default({})
    .optional()
    .openapi({
      description: "Defines the default Organization ID and flows",
    }),
  organization_usage: z
    .enum(["deny", "allow", "require"])
    .default("deny")
    .optional()
    .openapi({
      description:
        "Defines how to proceed during an authentication transaction with regards an organization. Can be deny (default), allow or require.",
    }),
  organization_require_behavior: z
    .enum(["no_prompt", "pre_login_prompt", "post_login_prompt"])
    .default("no_prompt")
    .optional()
    .openapi({
      description:
        "Defines how to proceed during an authentication transaction when client.organization_usage: 'require'. Can be no_prompt (default), pre_login_prompt or post_login_prompt. post_login_prompt requires oidc_conformant: true.",
    }),
  client_authentication_methods: z
    .record(z.string(), z.any())
    .default({})
    .optional()
    .openapi({
      description: "Defines client authentication methods.",
    }),
  require_pushed_authorization_requests: z.boolean().default(false).openapi({
    description:
      "Makes the use of Pushed Authorization Requests mandatory for this client",
  }),
  require_proof_of_possession: z.boolean().default(false).openapi({
    description:
      "Makes the use of Proof-of-Possession mandatory for this client",
  }),
  signed_request_object: z
    .record(z.string(), z.any())
    .default({})
    .optional()
    .openapi({
      description: "JWT-secured Authorization Requests (JAR) settings.",
    }),
  compliance_level: z
    .enum([
      "none",
      "fapi1_adv_pkj_par",
      "fapi1_adv_mtls_par",
      "fapi2_sp_pkj_mtls",
      "fapi2_sp_mtls_mtls",
    ])
    .optional()
    .openapi({
      description:
        "Defines the compliance level for this client, which may restrict it's capabilities",
    }),
  par_request_expiry: z.number().optional().openapi({
    description:
      "Specifies how long, in seconds, a Pushed Authorization Request URI remains valid",
  }),
  token_quota: z.record(z.string(), z.any()).default({}).optional(),
  owner_user_id: z.string().optional().openapi({
    description:
      "User ID of the consenting user when this client was created via IAT-gated Dynamic Client Registration. NULL for clients created via the Management API or open DCR.",
  }),
  registration_type: z
    .enum(["manual", "open_dcr", "iat_dcr"])
    .optional()
    .openapi({
      description:
        "Provenance of this client. `manual` = Management API; `open_dcr` = RFC 7591 without IAT; `iat_dcr` = RFC 7591 with an Initial Access Token.",
    }),
  registration_metadata: z
    .record(z.string(), z.any())
    .default({})
    .optional()
    .openapi({
      description:
        "Arbitrary metadata captured at Dynamic Client Registration time that isn't a first-class client field (e.g. integration_type, domain). Also stores `iat_constraints` for clients created via IAT so RFC 7592 PUT can enforce field immutability.",
    }),
  user_linking_mode: z.enum(["builtin", "off"]).optional().openapi({
    description:
      "Per-client override for the built-in email-based user-linking path. `builtin` runs the legacy in-process linking at user creation/email update. `off` disables the legacy path; linking only happens if the tenant has enabled the `account-linking` template hook. When unset, the service-level `userLinkingMode` default applies.",
  }),
});

export type ClientInsert = z.input<typeof clientInsertSchema>;

export const clientSchema = z
  .object({
    created_at: z.string(),
    updated_at: z.string(),
  })
  .extend(clientInsertSchema.shape)
  .extend({
    // Insert allows omitting (server-generated to match Auth0). The read schema
    // always has it — the row in storage is non-null.
    client_id: z.string(),
  });

export type Client = z.infer<typeof clientSchema>;
