import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: Create organizations table
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("organizations")
    .addColumn("id", "varchar(256)", (col) => col.primaryKey())
    .addColumn("tenant_id", "varchar(256)", (col) => col.notNull())
    .addColumn("name", "varchar(256)", (col) => col.notNull())
    .addColumn("display_name", "varchar(256)")
    .addColumn("branding", "text") // JSON string for branding object
    .addColumn("metadata", "text") // JSON string for metadata object
    .addColumn("enabled_connections", "text") // JSON string for enabled_connections array
    .addColumn("token_quota", "text") // JSON string for token_quota object
    .addColumn("created_at", "varchar(256)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(256)", (col) => col.notNull())
    .execute();

  // Add index on tenant_id for better query performance
  await db.schema
    .createIndex("idx_organizations_tenant_id")
    .on("organizations")
    .column("tenant_id")
    .execute();

  // Add unique constraint on (tenant_id, name) to prevent duplicate organization names within a tenant
  await db.schema
    .createIndex("idx_organizations_tenant_name_unique")
    .on("organizations")
    .columns(["tenant_id", "name"])
    .unique()
    .execute();
}

/**
 * Down migration: Drop organizations table
 */
export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("organizations").execute();
}
