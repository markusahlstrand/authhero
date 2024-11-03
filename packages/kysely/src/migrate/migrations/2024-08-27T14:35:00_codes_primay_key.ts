import { Kysely } from "kysely";
import { Database } from "@authhero/kysely-adapter";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("codes").execute();

  await db.schema
    .createTable("codes")
    .addColumn("code_id", "varchar(255)", (col) => col.notNull())
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("user_id", "varchar(255)")
    .addColumn("login_id", "varchar(255)")
    .addColumn("connection_id", "varchar(255)")
    .addForeignKeyConstraint(
      "codes_user_id_tenant_id_constraint",
      ["user_id", "tenant_id"],
      "users",
      ["user_id", "tenant_id"],
      (cb) => cb.onDelete("cascade"),
    )
    .addColumn("code_type", "varchar(255)", (col) => col.notNull())
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("expires_at", "varchar(255)", (col) => col.notNull())
    .addColumn("used_at", "varchar(255)")
    .addPrimaryKeyConstraint("PK_codes_code_id_code_type", [
      "code_id",
      "code_type",
    ])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("codes").execute();

  await db.schema
    .createTable("codes")
    .addColumn("code_id", "varchar(255)", (col) => col.primaryKey())
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("user_id", "varchar(255)")
    .addColumn("connection_id", "varchar(255)")
    .addColumn("login_id", "varchar(255)")
    .addForeignKeyConstraint(
      "codes_user_id_tenant_id_constraint",
      ["user_id", "tenant_id"],
      "users",
      ["user_id", "tenant_id"],
      (cb) => cb.onDelete("cascade"),
    )
    .addColumn("code_type", "varchar(255)", (col) => col.notNull())
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("expires_at", "varchar(255)", (col) => col.notNull())
    .addColumn("used_at", "varchar(255)")
    .execute();
}
