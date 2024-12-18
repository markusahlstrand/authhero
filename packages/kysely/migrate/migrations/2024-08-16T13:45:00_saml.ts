import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(_: Kysely<Database>): Promise<void> {
  // Moved to inin migration for sqlite
  // await db.schema
  //   .alterTable("applications")
  //   .addColumn("addons", "varchar(4096)", (col) =>
  //     col.notNull().defaultTo("{}"),
  //   )
  //   .addColumn("callbacks", "varchar(1024)", (col) =>
  //     col.notNull().defaultTo("[]"),
  //   )
  //   .addColumn("allowed_origins", "varchar(1024)", (col) =>
  //     col.notNull().defaultTo("[]"),
  //   )
  //   .addColumn("web_origins", "varchar(1024)", (col) =>
  //     col.notNull().defaultTo("[]"),
  //   )
  //   .execute();
  // Migrage the data
  //   UPDATE applications SET callbacks = "[]";
  //   UPDATE applications SET web_origins = "[]";
  //   UPDATE applications SET web_origins = "[]";
  //   UPDATE applications SET allowed_origins = "[]";
}

export async function down(_: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("applications")
  //   .dropColumn("addons")
  //   .dropColumn("callbacks")
  //   .dropColumn("allowed_origins")
  //   .dropColumn("web_origins")
  //   .execute();
}
