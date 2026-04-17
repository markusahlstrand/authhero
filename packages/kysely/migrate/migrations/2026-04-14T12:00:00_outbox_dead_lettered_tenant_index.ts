import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Composite index for the failed-events management endpoints.
 *
 * `listFailed` filters `tenant_id = ? AND dead_lettered_at IS NOT NULL` and
 * orders by `dead_lettered_at DESC`. Leading `tenant_id` (the equality
 * predicate) lets the optimizer seek directly to a tenant's slice; the
 * trailing `dead_lettered_at` then serves both the `IS NOT NULL` filter and
 * the ORDER BY without a separate sort step.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createIndex("idx_outbox_events_tenant_dead_lettered")
    .on("outbox_events")
    .columns(["tenant_id", "dead_lettered_at"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropIndex("idx_outbox_events_tenant_dead_lettered").execute();
}
