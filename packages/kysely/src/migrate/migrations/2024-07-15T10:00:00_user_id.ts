import { Kysely } from "kysely";
import { Database } from "@authhero/kysely-adapter";

export async function up(_: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("users")
  //   .addColumn("user_id", "varchar(255)")
  //   .execute();
}

export async function down(_: Kysely<Database>): Promise<void> {
  // await db.schema.alterTable("users").dropColumn("user_id").execute();
}
