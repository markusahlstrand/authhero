import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Role permissions assignment table
  await db.schema
    .createTable("role_permissions")
    .addColumn("tenant_id", "varchar(191)", (col) => col.notNull())
    .addColumn("role_id", "varchar(21)", (col) => col.notNull())
    .addColumn("resource_server_identifier", "varchar(191)", (col) =>
      col.notNull(),
    )
    .addColumn("permission_name", "varchar(191)", (col) => col.notNull())
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addPrimaryKeyConstraint("role_permissions_pk", [
      "tenant_id",
      "role_id",
      "resource_server_identifier",
      "permission_name",
    ])
    .execute();

  // Add foreign key constraints
  await db.schema
    .createIndex("role_permissions_role_fk")
    .on("role_permissions")
    .columns(["tenant_id", "role_id"])
    .execute();

  await db.schema
    .createIndex("role_permissions_permission_fk")
    .on("role_permissions")
    .columns(["tenant_id", "resource_server_identifier", "permission_name"])
    .execute();

  // User permissions assignment table
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

  // Add foreign key constraints
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
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("user_permissions").execute();
  await db.schema.dropTable("role_permissions").execute();
}
