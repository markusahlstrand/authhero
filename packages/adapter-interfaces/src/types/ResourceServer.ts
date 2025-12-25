import { z } from "@hono/zod-openapi";

export const resourceServerScopeSchema = z.object({
  value: z.string(),
  description: z.string().optional(),
});
export type ResourceServerScope = z.infer<typeof resourceServerScopeSchema>;

export const resourceServerOptionsSchema = z.object({
  token_dialect: z.enum(["access_token", "access_token_authz"]).optional(),
  enforce_policies: z.boolean().optional(),
  allow_skipping_userinfo: z.boolean().optional(),
  skip_userinfo: z.boolean().optional(),
  persist_client_authorization: z.boolean().optional(),
  enable_introspection_endpoint: z.boolean().optional(),
  mtls: z
    .object({
      bound_access_tokens: z.boolean().optional(),
    })
    .optional(),
});
export type ResourceServerOptions = z.infer<typeof resourceServerOptionsSchema>;

export const resourceServerInsertSchema = z.object({
  name: z.string(),
  identifier: z.string(),
  scopes: z.array(resourceServerScopeSchema).optional(),
  signing_alg: z.string().optional(),
  signing_secret: z.string().optional(),
  token_lifetime: z.number().optional(),
  token_lifetime_for_web: z.number().optional(),
  skip_consent_for_verifiable_first_party_clients: z.boolean().optional(),
  allow_offline_access: z.boolean().optional(),
  verificationKey: z.string().optional(),
  options: resourceServerOptionsSchema.optional(),
  is_system: z.boolean().optional(),
});
export type ResourceServerInsert = z.input<typeof resourceServerInsertSchema>;

export const resourceServerSchema = z.object({
  id: z.string().optional(),
  ...resourceServerInsertSchema.shape,
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type ResourceServer = z.infer<typeof resourceServerSchema>;

export const resourceServerListSchema = z.array(resourceServerSchema);
export type ResourceServerList = z.infer<typeof resourceServerListSchema>;
