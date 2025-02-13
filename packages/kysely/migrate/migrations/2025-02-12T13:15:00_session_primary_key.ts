import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: changes the primary key to id.
 */
export async function up(_: Kysely<Database>): Promise<void> {
  // Moved to earlier migration
}

/**
 * Down migration: drops the added sessions table fields
 */
export async function down(_: Kysely<Database>): Promise<void> {
  // Moved to earlier migration
}
