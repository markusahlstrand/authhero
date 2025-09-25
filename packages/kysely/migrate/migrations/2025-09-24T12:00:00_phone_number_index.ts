import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: Add optimized index for phone number queries
 * This index optimizes queries that filter by tenant_id, phone_number, and provider
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createIndex("users_phone_tenant_provider_index")
    .on("users")
    .columns(["tenant_id", "phone_number", "provider"])
    .execute();
}

/**
 * Down migration: Drop the phone number index
 */
export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropIndex("users_phone_tenant_provider_index").execute();
}
