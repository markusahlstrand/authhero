import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("clients")
    .addColumn("connections", "text", (col) => col.notNull().defaultTo("[]"))
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("clients").dropColumn("connections").execute();
}
