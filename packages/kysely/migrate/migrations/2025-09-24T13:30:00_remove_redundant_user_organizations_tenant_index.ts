import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: Remove redundant tenant_id index from user_organizations
 * The unique constraint (tenant_id, user_id, organization_id) already provides
 * efficient indexing for tenant_id queries, making the separate tenant_id index redundant
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.dropIndex("idx_user_organizations_tenant_id").execute();
}

/**
 * Down migration: Recreate the tenant_id index
 */
export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createIndex("idx_user_organizations_tenant_id")
    .on("user_organizations")
    .column("tenant_id")
    .execute();
}
