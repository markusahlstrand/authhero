import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: Drop old columns
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("logins").execute();
  await db.schema.dropTable("sessions_2").execute();
  await db.schema.dropTable("refresh_tokens_2").execute();
}

/**
 * Down migration: restore the domains table
 */
export async function down(_: Kysely<Database>): Promise<void> {}
