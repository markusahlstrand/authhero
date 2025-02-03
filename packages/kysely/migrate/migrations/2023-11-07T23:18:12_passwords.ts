import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("passwords")
    .addColumn("tenant_id", "varchar(255)")
    .addColumn("user_id", "varchar(255)")
    .addPrimaryKeyConstraint("passwords_pkey", ["user_id", "tenant_id"])
    .addForeignKeyConstraint(
      "user_id_constraint",
      ["user_id", "tenant_id"],
      "users",
      ["user_id", "tenant_id"],
      (cb) => cb.onDelete("cascade"),
    )
    .addColumn("created_at", "varchar(255)")
    .addColumn("updated_at", "varchar(255)")
    .execute();

  await db.schema
    .createTable("codes")
    .addColumn("id", "varchar(255)", (col) => col.primaryKey())
    .addColumn("user_id", "varchar(255)")
    .addColumn("tenant_id", "varchar(255)")
    .addForeignKeyConstraint(
      "user_id_constraint",
      ["user_id", "tenant_id"],
      "users",
      ["user_id", "tenant_id"],
      (cb) => cb.onDelete("cascade"),
    )
    .addColumn("type", "varchar(255)", (col) => col.notNull())
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("expires_at", "varchar(255)", (col) => col.notNull())
    .addColumn("used_at", "varchar(255)")
    .execute();

  await db.schema
    .createIndex("codes_expires_at_index")
    .on("codes")
    .column("expires_at")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("passwords").execute();
  await db.schema.dropTable("codes").execute();
}
