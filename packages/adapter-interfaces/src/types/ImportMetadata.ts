import { z } from "@hono/zod-openapi";

/**
 * Import-only metadata for entity `create()` calls.
 *
 * These values are deliberately NOT part of any public `*InsertSchema` and are
 * never accepted on the normal management-API write routes. They reach an
 * adapter only through the dedicated `options.importMetadata` argument, which
 * the HTTP layer never populates — so request bodies can never set a row's
 * timestamps or primary id. The tenant export/import engine is the only caller
 * that passes them, in order to reproduce a source tenant's rows faithfully.
 *
 * When omitted, `create()` keeps its existing behavior: generate the id and
 * stamp `created_at`/`updated_at` with the current time.
 */
export const importMetadataSchema = z.object({
  /** Preserve the source row's primary id (entity-specific column). */
  id: z.string().optional(),
  /** Preserve the source row's `created_at`. */
  created_at: z.string().optional(),
  /** Preserve the source row's `updated_at`. */
  updated_at: z.string().optional(),
});

export type ImportMetadata = z.infer<typeof importMetadataSchema>;

/**
 * Optional third argument accepted by every durable entity's `create()`.
 * Reserved for import-only concerns; see {@link ImportMetadata}.
 */
export interface CreateOptions {
  importMetadata?: ImportMetadata;
}
