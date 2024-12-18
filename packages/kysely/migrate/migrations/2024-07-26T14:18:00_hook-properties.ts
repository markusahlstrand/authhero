import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(_: Kysely<Database>): Promise<void> {
  // Sqlite does not like this
  // await db.schema
  //   .alterTable("hooks")
  //   .addColumn("synchronous", "boolean", (col) =>
  //     col.defaultTo(false).notNull(),
  //   )
  //   .addColumn("priority", "integer")
  //   .execute();
}

export async function down(_: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("hooks")
  //   .dropColumn("algorithm")
  //   .dropColumn("priority")
  //   .execute();
}
