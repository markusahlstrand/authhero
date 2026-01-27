import { z } from "@hono/zod-openapi";
import { nanoid } from "nanoid";

export const clientInsertSchema = z.object({
  client_id: z.string().openapi({
    description: "ID of this client.",
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
  is_first_party: z.boolean().default(false).openapi({
    description:
      "Whether this client a first party client (true) or not (false).",
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
  session_transfer: z.record(z.any()).default({}).optional().openapi({
    description: "Native to Web SSO Configuration",
  }),
  oidc_logout: z.record(z.any()).default({}).optional().openapi({
    description: "Configuration for OIDC backchannel logout",
  }),
  grant_types: z.array(z.string()).default([]).optional().openapi({
    description:
      "List of grant types supported for this application. Can include authorization_code, implicit, refresh_token, client_credentials, password, http://auth0.com/oauth/grant-type/password-realm, http://auth0.com/oauth/grant-type/mfa-oob, http://auth0.com/oauth/grant-type/mfa-otp, http://auth0.com/oauth/grant-type/mfa-recovery-code, urn:openid:params:grant-type:ciba, and urn:ietf:params:oauth:grant-type:device_code.",
  }),
  jwt_configuration: z.record(z.any()).default({}).optional().openapi({
    description: "Configuration related to JWTs for the client.",
  }),
  signing_keys: z.array(z.record(z.any())).default([]).optional().openapi({
    description: "Signing certificates associated with this client.",
  }),
  encryption_key: z.record(z.any()).default({}).optional().openapi({
    description: "Encryption used for WsFed responses with this client.",
  }),
  sso: z.boolean().default(false).openapi({
    description:
      "Applies only to SSO clients and determines whether Auth0 will handle Single Sign On (true) or whether the Identity Provider will (false).",
  }),
  sso_disabled: z.boolean().default(true).openapi({
    description:
      "Whether Single Sign On is disabled (true) or enabled (true). Defaults to true.",
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
  addons: z.record(z.any()).default({}).optional().openapi({
    description:
      "Addons enabled for this client and their associated configurations.",
  }),
  token_endpoint_auth_method: z
    .enum(["none", "client_secret_post", "client_secret_basic"])
    .default("client_secret_basic")
    .optional()
    .openapi({
      description:
        "Defines the requested authentication method for the token endpoint. Can be none (public client without a client secret), client_secret_post (client uses HTTP POST parameters), or client_secret_basic (client uses HTTP Basic).",
    }),
  client_metadata: z
    .record(z.string().max(255))
    .default({})
    .optional()
    .openapi({
      description:
        'Metadata associated with the client, in the form of an object with string values (max 255 chars). Maximum of 10 metadata properties allowed. Field names (max 255 chars) are alphanumeric and may only include the following special characters: :,-+=_*?"/()\u003c\u003e@ [Tab][Space]',
    }),
  mobile: z.record(z.any()).default({}).optional().openapi({
    description: "Additional configuration for native mobile apps.",
  }),
  initiate_login_uri: z.string().url().optional().openapi({
    description: "Initiate login uri, must be https",
  }),
  native_social_login: z.record(z.any()).default({}).optional(),
  refresh_token: z.record(z.any()).default({}).optional().openapi({
    description: "Refresh token configuration",
  }),
  default_organization: z.record(z.any()).default({}).optional().openapi({
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
    .record(z.any())
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
  signed_request_object: z.record(z.any()).default({}).optional().openapi({
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
  token_quota: z.record(z.any()).default({}).optional(),
});

export type ClientInsert = z.input<typeof clientInsertSchema>;

export const clientSchema = z.object({
  created_at: z.string(),
  updated_at: z.string(),
  ...clientInsertSchema.shape,
});

export type Client = z.infer<typeof clientSchema>;
