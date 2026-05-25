import { z } from "@hono/zod-openapi";
import { deviceSchema } from "./Device";

export const refreshTokenInsertSchema = z.object({
  // Internal primary key (ULID). Never sent to clients in the new wire format.
  id: z.string(),

  // Link to the login session
  login_id: z.string(),

  // Link to user (foreign key)
  user_id: z.string(),

  client_id: z.string(),

  // When the refresh token expires.
  expires_at: z.string().optional(),
  idle_expires_at: z.string().optional(),

  // When the token was last used.
  last_exchanged_at: z.string().optional(),

  device: deviceSchema,
  resource_servers: z.array(
    z.object({
      audience: z.string(),
      scopes: z.string(),
    }),
  ),

  rotating: z.boolean(),

  // Plaintext lookup slice extracted from the wire token. Indexed for the
  // refresh-grant path. NULL on legacy (pre-hashing) rows.
  token_lookup: z.string().optional(),

  // SHA-256 hex of the secret part of the wire token. NULL on legacy rows.
  token_hash: z.string().optional(),

  // Root token id of the rotation chain. NULL on legacy rows; for the first
  // token in a chain it equals `id`.
  family_id: z.string().optional(),

  // Most recently issued child id (debug/traceability). NULL until rotated.
  rotated_to: z.string().optional(),

  // ISO of the *first* rotation. Anchors the leeway window so siblings minted
  // within the window don't extend the parent's exposure.
  rotated_at: z.string().optional(),
});

export type RefreshTokenInsert = z.infer<typeof refreshTokenInsertSchema>;

// Full refresh token schema with creation metadata.
export const refreshTokenSchema = refreshTokenInsertSchema.extend({
  // When the refresh token record was created.
  created_at: z.string(),

  // When the token was explicitly revoked (null = still active).
  revoked_at: z.string().optional(),
});

export type RefreshToken = z.infer<typeof refreshTokenSchema>;
