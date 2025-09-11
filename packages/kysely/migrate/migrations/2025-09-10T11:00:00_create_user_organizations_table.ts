import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: Create user_organizations table
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("user_organizations")
    .addColumn("id", "varchar(21)", (col) => col.primaryKey())
    .addColumn("tenant_id", "varchar(191)", (col) => col.notNull())
    .addColumn("user_id", "varchar(191)", (col) => col.notNull())
    .addColumn("organization_id", "varchar(21)", (col) => col.notNull())
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(35)", (col) => col.notNull())
    .addUniqueConstraint("user_organizations_unique", [
      "tenant_id",
      "user_id",
      "organization_id",
    ])
    .execute();

  // Add indexes for better query performance
  await db.schema
    .createIndex("idx_user_organizations_tenant_id")
    .on("user_organizations")
    .column("tenant_id")
    .execute();

  await db.schema
    .createIndex("idx_user_organizations_user_id")
    .on("user_organizations")
    .column("user_id")
    .execute();

  await db.schema
    .createIndex("idx_user_organizations_organization_id")
    .on("user_organizations")
    .column("organization_id")
    .execute();
}

/**
 * Down migration: Drop user_organizations table
 */
export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("user_organizations").execute();
}
