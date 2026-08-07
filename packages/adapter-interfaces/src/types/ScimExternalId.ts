import { z } from "@hono/zod-openapi";

/**
 * Maps an IdP-assigned SCIM `externalId` to an AuthHero `user_id`, scoped to a
 * connection. Kept out of the shared user schema so the (per-connection) SCIM
 * concern stays isolated and a linked user can carry external ids from more
 * than one SCIM connection. IdPs look users up by `externalId eq "…"` before
 * creating, so this must be queryable by (connection_id, external_id).
 */
export const scimExternalIdInsertSchema = z.object({
  connection_id: z.string(),
  external_id: z.string(),
  user_id: z.string(),
});

export type ScimExternalIdInsert = z.infer<typeof scimExternalIdInsertSchema>;

export const scimExternalIdSchema = z
  .object({
    created_at: z.string(),
  })
  .extend(scimExternalIdInsertSchema.shape);

export type ScimExternalId = z.infer<typeof scimExternalIdSchema>;
