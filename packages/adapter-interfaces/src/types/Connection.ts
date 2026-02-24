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
  provider: z.string().optional(),
  from: z.string().optional(),
  twilio_sid: z.string().optional(),
  twilio_token: z.string().optional(),
  icon_url: z.string().optional(),
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
  // Import mode
  import_mode: z.boolean().optional(),
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
        })
        .optional(),
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
});

export const connectionInsertSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  display_name: z.string().optional(),
  strategy: z.string(),
  options: connectionOptionsSchema.default({}),
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
