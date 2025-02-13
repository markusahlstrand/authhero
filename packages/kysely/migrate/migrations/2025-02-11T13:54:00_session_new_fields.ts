import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: adds missing fields to the sessions.
 */
export async function up(_: Kysely<Database>): Promise<void> {
  // Moved to earlie migration
}

/**
 * Down migration: drops the added sessions table fields
 */
export async function down(_: Kysely<any>): Promise<void> {}
