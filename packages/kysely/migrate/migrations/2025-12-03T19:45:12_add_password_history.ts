import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(db: Kysely<Database>): Promise<void> {
  // Drop old table and recreate with new schema (required for SQLite primary key changes)
  await db.schema.dropTable("passwords").execute();

  await db.schema
    .createTable("passwords")
    .addColumn("id", "varchar(21)", (col) => col.primaryKey())
    .addColumn("user_id", "varchar(191)", (col) => col.notNull())
    .addColumn("tenant_id", "varchar(191)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("password", "varchar(255)", (col) => col.notNull())
    .addColumn("algorithm", "varchar(255)", (col) =>
      col.notNull().defaultTo("bcrypt"),
    )
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(35)", (col) => col.notNull())
    .addColumn("is_current", "integer", (col) => col.notNull().defaultTo(1))
    .addForeignKeyConstraint(
      "passwords_user_id_tenant_id_constraint",
      ["user_id", "tenant_id"],
      "users",
      ["user_id", "tenant_id"],
      (cb) => cb.onDelete("cascade"),
    )
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("passwords").execute();

  await db.schema
    .createTable("passwords")
    .addColumn("user_id", "varchar(255)", (col) => col.notNull())
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("password", "varchar(255)", (col) => col.notNull())
    .addColumn("algorithm", "varchar(255)", (col) =>
      col.notNull().defaultTo("bcrypt"),
    )
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(35)", (col) => col.notNull())
    .addPrimaryKeyConstraint("passwords_pkey", ["user_id", "tenant_id"])
    .addForeignKeyConstraint(
      "passwords_user_id_tenant_id_constraint",
      ["user_id", "tenant_id"],
      "users",
      ["user_id", "tenant_id"],
      (cb) => cb.onDelete("cascade"),
    )
    .execute();
}
