import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(_: Kysely<Database>): Promise<void> {
  // await db.schema.alterTable("users").dropColumn("linked_to").execute();
  // await db.schema
  //   .alterTable("users")
  //   .addColumn("linked_to", "varchar(255)", (col) =>
  //     col.references("users.id").onDelete("cascade"),
  //   )
  //   .addColumn("last_ip", "varchar(255)")
  //   .addColumn("login_count", "integer")
  //   .addColumn("last_login", "varchar(255)")
  //   .addColumn("provider", "varchar(255)")
  //   .addColumn("connection", "varchar(255)")
  //   .addColumn("email_verified", "boolean")
  //   .addColumn("is_social", "boolean")
  //   .addColumn("app_metadata", "varchar(8092)")
  //   .execute();
}

export async function down(_: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("users")
  //   .dropColumn("last_ip")
  //   .dropColumn("login_count")
  //   .dropColumn("provider")
  //   .dropColumn("connection")
  //   .dropColumn("email_verified")
  //   .dropColumn("is_social")
  //   .dropColumn("app_metadata")
  //   .execute();
  // await db.schema
  //   .alterTable("users")
  //   .addColumn("linked_to", "varchar(255)")
  //   .execute();
}
