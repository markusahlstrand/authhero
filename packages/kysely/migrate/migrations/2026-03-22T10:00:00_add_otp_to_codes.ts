import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("codes").addColumn("otp", "varchar(32)").execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("codes").dropColumn("otp").execute();
}
