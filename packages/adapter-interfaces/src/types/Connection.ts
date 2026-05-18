import { z } from "@hono/zod-openapi";
import {
  AuthorizationResponseMode,
  AuthorizationResponseType,
} from "./AuthParams";

export const connectionOptionsSchema = z.object({
  kid: z.string().optional(),
  team_id: z.string().optional(),
  realms: z.string().optional(),
  authentication_method: z.string().optional(),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
  app_secret: z.string().optional(),
  scope: z.string().optional(),
  authorization_endpoint: z.string().optional(),
  token_endpoint: z.string().optional(),
  userinfo_endpoint: z.string().optional(),
  jwks_uri: z.string().optional(),
  discovery_url: z.string().optional(),
  issuer: z.string().optional(),
  // How client credentials are sent to the token endpoint for upstream OIDC /
  // OAuth2 connections. Defaults to `client_secret_basic` (HTTP Basic auth).
  // Set to `client_secret_post` for providers like JumpCloud that reject Basic.
  token_endpoint_auth_method: z
    .enum(["client_secret_basic", "client_secret_post"])
    .optional(),
  provider: z.string().optional(),
  from: z.string().optional(),
  twilio_sid: z.string().optional(),
  twilio_token: z.string().optional(),
  icon_url: z.string().optional(),
  // Email domains that route to this connection via Home Realm Discovery
  domain_aliases: z.array(z.string()).optional(),
  // Per-connection redirect_uri sent to the upstream IdP. When unset, the
  // strategy falls back to the legacy `${authUrl}callback`. Lets operators
  // migrate connections to a new callback path (e.g. `/login/callback`)
  // gradually — the value must be registered as an allowed redirect URI at
  // the upstream IdP.
  callback_url: z.string().url().optional(),
  // Password policy options for Username-Password-Authentication connections
  passwordPolicy: z
    .enum(["none", "low", "fair", "good", "excellent"])
    .optional(),
  password_complexity_options: z
    .object({
      min_length: z.number().optional(),
    })
    .optional(),
  password_history: z
    .object({
      enable: z.boolean().optional(),
      size: z.number().optional(),
    })
    .optional(),
  password_no_personal_info: z
    .object({
      enable: z.boolean().optional(),
    })
    .optional(),
  password_dictionary: z
    .object({
      enable: z.boolean().optional(),
      dictionary: z.array(z.string()).optional(),
    })
    .optional(),
  // Disable signup for this connection
  disable_signup: z.boolean().optional(),
  // Brute force protection
  brute_force_protection: z.boolean().optional(),
  // Import mode (Auth0 custom-DB semantics): when true and a successful
  // upstream verification occurs, the user/password row is created locally
  // so subsequent logins are served entirely from authhero.
  import_mode: z.boolean().optional(),
  // Upstream migration credentials. Mirrors Auth0's
  // `options.configuration` (encrypted env-vars accessed from custom
  // scripts). For lazy migration, set when `import_mode: true`.
  configuration: z
    .object({
      token_endpoint: z.string().optional(),
      userinfo_endpoint: z.string().optional(),
      client_id: z.string().optional(),
      client_secret: z.string().optional(),
      // Optional override for the `realm` sent in the password-realm grant.
      // Defaults to the connection name when omitted.
      realm: z.string().optional(),
    })
    .optional(),
  // Flexible Identifiers: attributes schema (replaces legacy requires_username)
  attributes: z
    .object({
      email: z
        .object({
          identifier: z
            .object({
              active: z.boolean().optional(),
            })
            .optional(),
          signup: z
            .object({
              status: z.enum(["required", "optional", "disabled"]).optional(),
              verification: z
                .object({
                  active: z.boolean().optional(),
                })
                .optional(),
            })
            .optional(),
          validation: z
            .object({
              allowed: z.boolean().optional(),
            })
            .optional(),
          unique: z.boolean().optional(),
          profile_required: z.boolean().optional(),
          verification_method: z.enum(["link", "code"]).optional(),
        })
        .optional(),
      username: z
        .object({
          identifier: z
            .object({
              active: z.boolean().optional(),
            })
            .optional(),
          signup: z
            .object({
              status: z.enum(["required", "optional", "disabled"]).optional(),
            })
            .optional(),
          validation: z
            .object({
              max_length: z.number().optional(),
              min_length: z.number().optional(),
              allowed_types: z
                .object({
                  email: z.boolean().optional(),
                  phone_number: z.boolean().optional(),
                })
                .optional(),
            })
            .optional(),
          profile_required: z.boolean().optional(),
        })
        .optional(),
      phone_number: z
        .object({
          identifier: z
            .object({
              active: z.boolean().optional(),
            })
            .optional(),
          signup: z
            .object({
              status: z.enum(["required", "optional", "disabled"]).optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
  // Authentication methods for Username-Password-Authentication connections
  authentication_methods: z
    .object({
      password: z
        .object({
          enabled: z.boolean().optional(),
        })
        .optional(),
      passkey: z
        .object({
          enabled: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
  // Passkey options for Username-Password-Authentication connections
  passkey_options: z
    .object({
      challenge_ui: z.enum(["both", "autofill", "button"]).optional(),
      local_enrollment_enabled: z.boolean().optional(),
      progressive_enrollment_enabled: z.boolean().optional(),
    })
    .optional(),
  // Legacy username options (deprecated, use attributes instead)
  requires_username: z.boolean().optional(),
  validation: z
    .object({
      username: z
        .object({
          min: z.number().optional(),
          max: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
  // Controls when root user attributes are updated from external IdP
  set_user_root_attributes: z
    .enum(["on_each_login", "on_first_login", "never_on_login"])
    .optional(),
});

// terraform's auth0 provider serializes unset connection-options fields as
// JSON null, including inside nested objects (e.g. password_complexity_options,
// attributes.email.signup). Strip nulls recursively before validation so
// optional fields don't reject "null" values at any depth.
function stripNullsDeep(v: unknown): unknown {
  if (v === null) return undefined;
  if (Array.isArray(v)) {
    return v.filter((x) => x !== null).map(stripNullsDeep);
  }
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val === null) continue;
      out[k] = stripNullsDeep(val);
    }
    return out;
  }
  return v;
}

export const connectionInsertSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  display_name: z.string().optional(),
  strategy: z.string(),
  options: z
    .preprocess(
      (v) => (v === null ? {} : stripNullsDeep(v)),
      connectionOptionsSchema,
    )
    .default({}),
  enabled_clients: z.array(z.string()).default([]).optional(),
  response_type: z.custom<AuthorizationResponseType>().optional(),
  response_mode: z.custom<AuthorizationResponseMode>().optional(),
  is_domain_connection: z.boolean().optional(),
  show_as_button: z.boolean().optional(),
  metadata: z.record(z.any()).optional(),
  is_system: z.boolean().optional(),
});
export type ConnectionInsert = z.infer<typeof connectionInsertSchema>;

export const connectionSchema = z
  .object({
    id: z.string(),
    created_at: z.string().transform((val) => (val === null ? "" : val)),
    updated_at: z.string().transform((val) => (val === null ? "" : val)),
  })
  .extend(connectionInsertSchema.shape);

export type Connection = z.infer<typeof connectionSchema>;
