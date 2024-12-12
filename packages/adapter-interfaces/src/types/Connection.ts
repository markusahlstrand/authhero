import { z } from "@hono/zod-openapi";
import {
  AuthorizationResponseMode,
  AuthorizationResponseType,
} from "./AuthParams";

export const connectionInsertSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  strategy: z.string(),
  options: z
    .object({
      kid: z.string().optional(),
      team_id: z.string().optional(),
      realms: z.string().optional(),
      client_id: z.string().optional(),
      client_secret: z.string().optional(),
      app_secret: z.string().optional(),
      scope: z.string().optional(),
      authorization_endpoint: z.string().default("").optional(),
      token_endpoint: z.string().default("").optional(),
      userinfo_endpoint: z.string().default("").optional(),
      jwks_uri: z.string().default("").optional(),
      discovery_url: z.string().default("").optional(),
      issuer: z.string().default("").optional(),
    })
    .default({})
    .optional(),
  enabled_clients: z.array(z.string()).default([]).optional(),
  response_type: z.custom<AuthorizationResponseType>().optional(),
  response_mode: z.custom<AuthorizationResponseMode>().optional(),
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
