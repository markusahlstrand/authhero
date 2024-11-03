import { Kysely } from "kysely";
import { Database } from "@authhero/kysely-adapter";

export async function up(_: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("sessions")
  //   .addColumn("deleted_at", "varchar(255)")
  //   .execute();
}

export async function down(_: Kysely<Database>): Promise<void> {
  // await db.schema.alterTable("sessions").dropColumn("deleted_at").execute();
}
