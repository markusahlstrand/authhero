import { z } from "@hono/zod-openapi";

export const refreshTokenInsertSchema = z.object({
  // The actual refresh token value (primary key).
  token: z.string(),

  // Link to the session record (foreign key).
  session_id: z.string(),

  // The scope and audience that was requested when the token was created.
  scope: z.string(),
  audience: z.string(),

  // When the refresh token expires.
  expires_at: z.string(),

  // When the token was last used.
  used_at: z.string().optional(),

  // If the token is revoked or deleted.
  revoked_at: z.string().optional(),
});

export type RefreshTokenInsert = z.infer<typeof refreshTokenInsertSchema>;

// Full refresh token schema with creation metadata.
export const refreshTokenSchema = z.object({
  // When the refresh token record was created.
  created_at: z.string(),

  // Spread in the rest of the refresh token properties.
  ...refreshTokenInsertSchema.shape,
});

export type RefreshToken = z.infer<typeof refreshTokenSchema>;
