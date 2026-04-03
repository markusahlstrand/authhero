import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: Add claim/lease columns to outbox_events for concurrent worker safety
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("outbox_events")
    .addColumn("claimed_by", "varchar(64)")
    .execute();

  await db.schema
    .alterTable("outbox_events")
    .addColumn("claim_expires_at", "varchar(35)")
    .execute();
}

/**
 * Down migration: Remove claim/lease columns from outbox_events
 */
export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("outbox_events")
    .dropColumn("claimed_by")
    .execute();

  await db.schema
    .alterTable("outbox_events")
    .dropColumn("claim_expires_at")
    .execute();
}
