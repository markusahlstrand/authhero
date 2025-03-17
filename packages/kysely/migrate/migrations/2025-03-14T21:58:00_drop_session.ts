import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: Add a new custom domains table
 */
export async function up(_: Kysely<Database>): Promise<void> {
  // await db.schema.dropTable("sessions").execute();
  // await db.schema.dropTable("refresh_tokens").execute();
}

/**
 * Down migration: restore the domains table
 */
export async function down(_: Kysely<Database>): Promise<void> {
  // This is just cleanup
}
