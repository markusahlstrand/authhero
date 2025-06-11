import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("codes")
    .addColumn("nonce", "varchar(1024)")
    .execute();

  await db.schema
    .alterTable("codes")
    .addColumn("state", "varchar(2048)")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("codes").dropColumn("nonce").execute();

  await db.schema.alterTable("codes").dropColumn("state").execute();
}
