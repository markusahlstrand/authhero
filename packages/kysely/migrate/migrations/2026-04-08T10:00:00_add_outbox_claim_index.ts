import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: Add composite index for outbox drain queries (cron relay)
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createIndex("idx_outbox_claim")
    .on("outbox_events")
    .columns([
      "processed_at",
      "claim_expires_at",
      "next_retry_at",
      "created_at",
    ])
    .execute();
}

/**
 * Down migration: Drop the outbox claim index
 */
export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropIndex("idx_outbox_claim").execute();
}
