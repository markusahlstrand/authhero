import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(_: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("connections")
  //   .addColumn("userinfo_endpoint", "varchar(256)")
  //   .execute();
}

export async function down(_: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("connections")
  //   .dropColumn("userinfo_endpoint")
  //   .execute();
}
