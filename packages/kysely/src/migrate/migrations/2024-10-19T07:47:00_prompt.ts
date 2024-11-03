import { Kysely } from "kysely";
import { Database } from "@authhero/kysely-adapter";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("logins")
    .addColumn("authParams_prompt", "varchar(16)")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("logins")
    .dropColumn("authParams_prompt")
    .execute();
}
