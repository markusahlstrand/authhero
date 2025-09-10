import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: Create user_organizations table
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("user_organizations")
    .addColumn("id", "varchar(256)", (col) => col.primaryKey())
    .addColumn("tenant_id", "varchar(256)", (col) => col.notNull())
    .addColumn("user_id", "varchar(256)", (col) => col.notNull())
    .addColumn("organization_id", "varchar(256)", (col) => col.notNull())
    .addColumn("created_at", "varchar(256)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(256)", (col) => col.notNull())
    .execute();

  // Add index on tenant_id for better query performance
  await db.schema
    .createIndex("idx_user_organizations_tenant_id")
    .on("user_organizations")
    .column("tenant_id")
    .execute();

  // Add index on user_id for getting user's organizations
  await db.schema
    .createIndex("idx_user_organizations_user_id")
    .on("user_organizations")
    .column("user_id")
    .execute();

  // Add index on organization_id for getting organization's members
  await db.schema
    .createIndex("idx_user_organizations_organization_id")
    .on("user_organizations")
    .column("organization_id")
    .execute();

  // Add unique constraint on (tenant_id, user_id, organization_id) to prevent duplicate memberships
  await db.schema
    .createIndex("idx_user_organizations_unique")
    .on("user_organizations")
    .columns(["tenant_id", "user_id", "organization_id"])
    .unique()
    .execute();

  // Add foreign key constraint to users table
  await db.schema
    .alterTable("user_organizations")
    .addForeignKeyConstraint(
      "fk_user_organizations_user",
      ["tenant_id", "user_id"],
      "users",
      ["tenant_id", "user_id"],
    )
    .onDelete("cascade")
    .execute();

  // Add foreign key constraint to organizations table
  await db.schema
    .alterTable("user_organizations")
    .addForeignKeyConstraint(
      "fk_user_organizations_organization",
      ["organization_id"],
      "organizations",
      ["id"],
    )
    .onDelete("cascade")
    .execute();
}

/**
 * Down migration: Drop user_organizations table
 */
export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("user_organizations").execute();
}
