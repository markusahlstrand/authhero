import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: Add tenant_id index for connections table
 * This optimizes queries that filter connections by tenant_id
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createIndex("connections_tenant_id_index")
    .on("connections")
    .column("tenant_id")
    .execute();
}

/**
 * Down migration: Drop the connections tenant_id index
 */
export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropIndex("connections_tenant_id_index").execute();
}
