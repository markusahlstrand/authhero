import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: Add index for login_sessions.id lookups
 * This optimizes queries that filter by id alone, since the composite primary key
 * (tenant_id, id) doesn't efficiently support id-only queries
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createIndex("login_sessions_id_index")
    .on("login_sessions")
    .column("id")
    .execute();
}

/**
 * Down migration: Drop the login_sessions id index
 */
export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropIndex("login_sessions_id_index").execute();
}
