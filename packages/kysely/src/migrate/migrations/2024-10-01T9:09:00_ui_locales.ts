import { Kysely } from "kysely";
import { Database } from "@authhero/kysely-adapter";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("logins")
    .addColumn("authParams_ui_locales", "varchar(32)")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("logins")
    .dropColumn("authParams_ui_locales")
    .execute();
}
