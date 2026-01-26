import { Database } from "../../src/db";
import { Kysely } from "kysely";

/**
 * Add preferred_username column to users table.
 * Per OIDC Core 5.1, preferred_username is the shorthand name
 * by which the End-User wishes to be referred to at the RP.
 * This is different from username which is used for authentication.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("users")
    .addColumn("preferred_username", "varchar(255)")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("users")
    .dropColumn("preferred_username")
    .execute();
}
