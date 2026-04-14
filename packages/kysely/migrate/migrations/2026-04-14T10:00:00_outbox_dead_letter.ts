import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: Add dead-letter columns to outbox_events.
 *
 * When an outbox event exhausts its retry budget, the relay marks it as
 * dead-lettered (processed_at is also set so it is excluded from relay
 * queries). The `final_error` column preserves the last failure for admin
 * investigation and the `dead_lettered_at` column lets the failed-events
 * management endpoints filter and order by dead-letter time.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("outbox_events")
    .addColumn("dead_lettered_at", "varchar(35)")
    .execute();

  await db.schema
    .alterTable("outbox_events")
    .addColumn("final_error", "text")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("outbox_events")
    .dropColumn("dead_lettered_at")
    .execute();

  await db.schema
    .alterTable("outbox_events")
    .dropColumn("final_error")
    .execute();
}
