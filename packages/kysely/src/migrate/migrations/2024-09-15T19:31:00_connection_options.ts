import { Kysely } from "kysely";
import { Database } from "@authhero/kysely-adapter";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("connections")
    .addColumn("options", "varchar(2048)", (col) =>
      col.defaultTo("{}").notNull(),
    )
    .addColumn("strategy", "varchar(64)")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("connections")
    .dropColumn("options")
    .dropColumn("strategy")
    .execute();
}
