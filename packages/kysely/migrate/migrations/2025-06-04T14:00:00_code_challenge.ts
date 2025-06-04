import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("codes")
    .addColumn("code_challenge", "varchar(128)")
    .execute();

  await db.schema
    .alterTable("codes")
    .addColumn("code_challenge_method", "varchar(5)")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("codes").dropColumn("code_challenge").execute();
  await db.schema
    .alterTable("codes")
    .dropColumn("code_challenge_method")
    .execute();
}
