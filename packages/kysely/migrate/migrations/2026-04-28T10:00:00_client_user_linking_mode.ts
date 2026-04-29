import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Adds `user_linking_mode` to `clients`. Per-client override for the built-in
 * email-based user-linking path: `builtin` (default), `template`, or `off`.
 * Resolved against the service-level `userLinkingMode` config.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("clients")
    .addColumn("user_linking_mode", "varchar(16)")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("clients")
    .dropColumn("user_linking_mode")
    .execute();
}
