import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: Create outbox_events table for transactional audit logging
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("outbox_events")
    .addColumn("id", "varchar(21)", (col) => col.primaryKey())
    .addColumn("tenant_id", "varchar(191)", (col) => col.notNull())
    .addColumn("event_type", "varchar(255)", (col) => col.notNull())
    .addColumn("log_type", "varchar(64)", (col) => col.notNull())
    .addColumn("aggregate_type", "varchar(64)", (col) => col.notNull())
    .addColumn("aggregate_id", "varchar(255)", (col) => col.notNull())
    .addColumn("payload", "text", (col) => col.notNull())
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addColumn("processed_at", "varchar(35)")
    .addColumn("retry_count", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("next_retry_at", "varchar(35)")
    .addColumn("error", "text")
    .execute();

  // Index for relay: fetch unprocessed events in order
  await db.schema
    .createIndex("idx_outbox_unprocessed")
    .on("outbox_events")
    .columns(["processed_at", "created_at"])
    .execute();

  // Index for querying events by tenant and type
  await db.schema
    .createIndex("idx_outbox_tenant_type")
    .on("outbox_events")
    .columns(["tenant_id", "event_type", "created_at"])
    .execute();
}

/**
 * Down migration: Drop outbox_events table
 */
export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("outbox_events").execute();
}
