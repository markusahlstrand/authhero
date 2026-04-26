import { z } from "@hono/zod-openapi";

export const clientRegistrationTokenTypeSchema = z.enum(["iat", "rat"]);
export type ClientRegistrationTokenType = z.infer<
  typeof clientRegistrationTokenTypeSchema
>;

export const clientRegistrationTokenInsertSchema = z.object({
  id: z.string(),
  token_hash: z.string(),
  type: clientRegistrationTokenTypeSchema,
  client_id: z.string().optional(),
  sub: z.string().optional(),
  constraints: z.record(z.unknown()).optional(),
  single_use: z.boolean().default(false),
  expires_at: z.string().optional(),
});

export type ClientRegistrationTokenInsert = z.infer<
  typeof clientRegistrationTokenInsertSchema
>;

export const clientRegistrationTokenSchema = z.object({
  created_at: z.string(),
  used_at: z.string().optional(),
  revoked_at: z.string().optional(),
  ...clientRegistrationTokenInsertSchema.shape,
});

export type ClientRegistrationToken = z.infer<
  typeof clientRegistrationTokenSchema
>;
