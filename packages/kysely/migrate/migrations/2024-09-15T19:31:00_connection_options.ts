import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(_: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("connections")
  //   .addColumn("options", "varchar(2048)", (col) =>
  //     col.defaultTo("{}").notNull(),
  //   )
  //   .addColumn("strategy", "varchar(64)")
  //   .execute();
}

export async function down(_: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("connections")
  //   .dropColumn("options")
  //   .dropColumn("strategy")
  //   .execute();
}
