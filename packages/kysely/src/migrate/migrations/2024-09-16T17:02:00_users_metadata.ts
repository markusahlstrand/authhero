import { Kysely } from "kysely";
import { Database } from "@authhero/kysely-adapter";

export async function up(_: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("users")
  //   .modifyColumn("app_metadata", "varchar(4096)", (col) =>
  //     col.defaultTo("{}").notNull(),
  //   )
  //   .addColumn("user_metadata", "varchar(4096)", (col) =>
  //     col.defaultTo("{}").notNull(),
  //   )
  //   .execute();
}

export async function down(_: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("users")
  //   .dropColumn("user_metadata")
  //   .modifyColumn("app_metadata", "varchar(8092)", (col) =>
  //     col.defaultTo("{}").notNull(),
  //   )
  //   .execute();
}
