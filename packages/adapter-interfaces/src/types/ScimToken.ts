import { z } from "@hono/zod-openapi";

export const scimTokenInsertSchema = z.object({
  token_id: z.string(),
  connection_id: z.string(),
  // SHA-256 hex of the raw bearer token. The raw value is returned to the
  // caller once at creation and never stored.
  token_hash: z.string(),
  scopes: z.array(z.string()).default([]),
  // ISO timestamp; omitted means the token does not expire.
  valid_until: z.string().optional(),
});

export type ScimTokenInsert = z.infer<typeof scimTokenInsertSchema>;

export const scimTokenSchema = z
  .object({
    created_at: z.string(),
    last_used_at: z.string().optional(),
  })
  .extend(scimTokenInsertSchema.shape);

export type ScimToken = z.infer<typeof scimTokenSchema>;
