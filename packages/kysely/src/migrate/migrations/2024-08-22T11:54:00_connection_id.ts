import { Kysely } from "kysely";
import { Database } from "@authhero/kysely-adapter";

export async function up(_: Kysely<Database>): Promise<void> {
  // This table is recreated in a later migration
  // await db.schema
  //   .alterTable("codes")
  //   .addColumn("connection_id", "varchar(255)")
  //   .execute();
}

export async function down(_: Kysely<Database>): Promise<void> {
  // await db.schema.alterTable("codes").dropColumn("connection_id").execute();
}
