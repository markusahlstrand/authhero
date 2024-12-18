import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(_: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("connections")
  //   .modifyColumn("options_client_id", "varchar(128)")
  //   .execute();
}

export async function down(_: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("connections")
  //   .modifyColumn("options_client_id", "varchar(32)")
  //   .execute();
}
