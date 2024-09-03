import { z } from "@hono/zod-openapi";
import {
  AuthorizationResponseMode,
  AuthorizationResponseType,
} from "./AuthParams";

export const connectionInsertSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  strategy: z
    .enum([
      "google-oauth2",
      "facebook",
      "vipps",
      "apple",
      "email",
      "Username-Password-Authentication",
      "oidc",
      "oauth2",
      "custom",
    ])
    .optional(),
  options: z
    .object({
      kid: z.string().optional(),
      team_id: z.string().optional(),
      realms: z.string().optional(),
      client_id: z.string().optional(),
      client_secret: z.string().optional(),
      app_secret: z.string().optional(),
      scope: z.string().optional(),
    })
    .optional()
    .default({}),
  enabled_clients: z.array(z.string()).optional().default([]),
  authorization_endpoint: z.string().optional().default(""),
  response_type: z.custom<AuthorizationResponseType>().optional(),
  response_mode: z.custom<AuthorizationResponseMode>().optional(),

  // Deprecated
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
  private_key: z.string().optional(),
  kid: z.string().optional(),
  team_id: z.string().optional(),
  token_endpoint: z.string().optional(),
  token_exchange_basic_auth: z.boolean().optional(),
  userinfo_endpoint: z.string().optional(),
  scope: z.string().optional(),
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
