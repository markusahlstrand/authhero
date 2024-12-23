import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(_: Kysely<Database>): Promise<void> {
  // So far we don't really care about the existing sessions
  // await db.schema.dropTable("sessions").execute();
  // We lost this index when moving the primary key
  // await db.schema
  //   .createIndex("users_user_id_tenant_id")
  //   .on("users")
  //   .columns(["user_id", "tenant_id"])
  //   .execute();
  // Recreate the sessions table with the new schema
  // await db.schema
  //   .createTable("sessions")
  //   .addColumn("session_id", "varchar(255)", (col) => col.primaryKey())
  //   .addColumn("client_id", "varchar(255)", (col) =>
  //     col.references("applications.id").onDelete("cascade").notNull(),
  //   )
  //   .addColumn("tenant_id", "varchar(255)")
  //   .addColumn("user_id", "varchar(255)")
  //   // same change here as on other tables - FK reference needed to users table
  //   .addForeignKeyConstraint(
  //     "user_id_constraint",
  //     ["user_id", "tenant_id"],
  //     "users",
  //     ["user_id", "tenant_id"],
  //     (cb) => cb.onDelete("cascade"),
  //   )
  //   .addColumn("created_at", "varchar(255)", (col) => col.notNull())
  //   .addColumn("expires_at", "varchar(255)", (col) => col.notNull())
  //   .addColumn("used_at", "varchar(255)")
  //   .addColumn("deleted_at", "varchar(255)")
  //   .execute();
}

export async function down(_: Kysely<Database>): Promise<void> {
  // await db.schema.dropTable("sessions").execute();
  // Recreate the sessions table with the old schema
  // await db.schema
  //   .createTable("sessions")
  //   .addColumn("id", "varchar(255)", (col) => col.primaryKey())
  //   .addColumn("client_id", "varchar(255)", (col) =>
  //     col.references("applications.id").onDelete("cascade").notNull(),
  //   )
  //   .addColumn("tenant_id", "varchar(255)")
  //   .addColumn("user_id", "varchar(255)")
  //   // same change here as on other tables - FK reference needed to users table
  //   .addForeignKeyConstraint(
  //     "user_id_constraint",
  //     ["user_id", "tenant_id"],
  //     "users",
  //     ["user_id", "tenant_id"],
  //     (cb) => cb.onDelete("cascade"),
  //   )
  //   .addColumn("created_at", "varchar(255)", (col) => col.notNull())
  //   .addColumn("expires_at", "varchar(255)", (col) => col.notNull())
  //   .addColumn("used_at", "varchar(255)")
  //   .addColumn("deleted_at", "varchar(255)")
  //   .execute();
}
