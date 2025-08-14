import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("user_roles")
    .addColumn("tenant_id", "varchar(191)", (col) => col.notNull())
    .addColumn("user_id", "varchar(191)", (col) => col.notNull())
    .addColumn("role_id", "varchar(21)", (col) => col.notNull())
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
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

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("user_roles").execute();
}
