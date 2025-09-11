import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Drop existing tables (this will remove all data)
  await db.schema.dropTable("user_permissions").execute();
  await db.schema.dropTable("user_roles").execute();

  // Recreate user_permissions table with organization_id
  await db.schema
    .createTable("user_permissions")
    .addColumn("tenant_id", "varchar(191)", (col) => col.notNull())
    .addColumn("user_id", "varchar(191)", (col) => col.notNull())
    .addColumn("resource_server_identifier", "varchar(21)", (col) =>
      col.notNull(),
    )
    .addColumn("permission_name", "varchar(191)", (col) => col.notNull())
    .addColumn("organization_id", "varchar(21)", (col) =>
      col.notNull().defaultTo(""),
    )
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addPrimaryKeyConstraint("user_permissions_pk", [
      "tenant_id",
      "user_id",
      "resource_server_identifier",
      "permission_name",
      "organization_id",
    ])
    .execute();

  // Add foreign key constraints for user_permissions
  await db.schema
    .createIndex("user_permissions_user_fk")
    .on("user_permissions")
    .columns(["tenant_id", "user_id"])
    .execute();

  await db.schema
    .createIndex("user_permissions_permission_fk")
    .on("user_permissions")
    .columns(["tenant_id", "resource_server_identifier", "permission_name"])
    .execute();

  // Add foreign key constraint for organization_id
  await db.schema
    .createIndex("user_permissions_organization_fk")
    .on("user_permissions")
    .column("organization_id")
    .execute();

  // Recreate user_roles table with organization_id
  await db.schema
    .createTable("user_roles")
    .addColumn("tenant_id", "varchar(191)", (col) => col.notNull())
    .addColumn("user_id", "varchar(191)", (col) => col.notNull())
    .addColumn("role_id", "varchar(21)", (col) => col.notNull())
    .addColumn("organization_id", "varchar(191)", (col) =>
      col.notNull().defaultTo(""),
    ) // empty string means no organization
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addPrimaryKeyConstraint("user_roles_pk", [
      "tenant_id",
      "user_id",
      "role_id",
      "organization_id",
    ])
    .execute();

  // Add foreign key constraints for user_roles
  await db.schema
    .createIndex("user_roles_user_fk")
    .on("user_roles")
    .columns(["tenant_id", "user_id"])
    .execute();

  await db.schema
    .createIndex("user_roles_role_fk")
    .on("user_roles")
    .columns(["tenant_id", "role_id"])
    .execute();

  // Add foreign key constraint for organization_id
  await db.schema
    .createIndex("user_roles_organization_fk")
    .on("user_roles")
    .column("organization_id")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop the new tables
  await db.schema.dropTable("user_permissions").execute();
  await db.schema.dropTable("user_roles").execute();

  // Recreate the original tables without organization_id
  await db.schema
    .createTable("user_permissions")
    .addColumn("tenant_id", "varchar(191)", (col) => col.notNull())
    .addColumn("user_id", "varchar(191)", (col) => col.notNull())
    .addColumn("resource_server_identifier", "varchar(191)", (col) =>
      col.notNull(),
    )
    .addColumn("permission_name", "varchar(191)", (col) => col.notNull())
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addPrimaryKeyConstraint("user_permissions_pk", [
      "tenant_id",
      "user_id",
      "resource_server_identifier",
      "permission_name",
    ])
    .execute();

  await db.schema
    .createIndex("user_permissions_user_fk")
    .on("user_permissions")
    .columns(["tenant_id", "user_id"])
    .execute();

  await db.schema
    .createIndex("user_permissions_permission_fk")
    .on("user_permissions")
    .columns(["tenant_id", "resource_server_identifier", "permission_name"])
    .execute();

  await db.schema
    .createTable("user_roles")
    .addColumn("tenant_id", "varchar(191)", (col) => col.notNull())
    .addColumn("user_id", "varchar(191)", (col) => col.notNull())
    .addColumn("role_id", "varchar(21)", (col) => col.notNull())
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addPrimaryKeyConstraint("user_roles_pk", [
      "tenant_id",
      "user_id",
      "role_id",
    ])
    .execute();

  await db.schema
    .createIndex("user_roles_user_fk")
    .on("user_roles")
    .columns(["tenant_id", "user_id"])
    .execute();

  await db.schema
    .createIndex("user_roles_role_fk")
    .on("user_roles")
    .columns(["tenant_id", "role_id"])
    .execute();
}
