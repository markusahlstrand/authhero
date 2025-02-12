import { z } from "@hono/zod-openapi";
import { deviceSchema } from "./Device";

export const refreshTokenInsertSchema = z.object({
  // The actual refresh token value (primary key).
  token: z.string(),

  // Link to the session record
  session_id: z.string(),

  // Link to user (foreign key)
  user_id: z.string(),

  // When the refresh token expires.
  expires_at: z.string().optional(),
  idle_expires_at: z.string().optional(),

  // When the token was last used.
  last_exchanged_at: z.string().optional(),

  device: deviceSchema.optional(),
  resource_servers: z.array(
    z.object({
      audience: z.string(),
      scopes: z.string(),
    }),
  ),

  rotating: z.boolean(),
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
