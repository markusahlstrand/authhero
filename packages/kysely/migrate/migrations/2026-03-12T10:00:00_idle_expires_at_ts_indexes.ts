import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createIndex("idx_sessions_idle_expires_at_ts")
    .on("sessions")
    .column("idle_expires_at_ts")
    .execute();

  await db.schema
    .createIndex("idx_refresh_tokens_idle_expires_at_ts")
    .on("refresh_tokens")
    .column("idle_expires_at_ts")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .dropIndex("idx_sessions_idle_expires_at_ts")
    .on("sessions")
    .execute();

  await db.schema
    .dropIndex("idx_refresh_tokens_idle_expires_at_ts")
    .on("refresh_tokens")
    .execute();
}
