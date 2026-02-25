import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: Add unique index on (username, provider, tenant_id)
 * Prevents two users from having the same username within the same tenant and provider
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createIndex("unique_username_provider")
    .on("users")
    .unique()
    .columns(["username", "provider", "tenant_id"])
    .execute();
}

/**
 * Down migration: Drop the unique username index
 */
export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropIndex("unique_username_provider").execute();
}
