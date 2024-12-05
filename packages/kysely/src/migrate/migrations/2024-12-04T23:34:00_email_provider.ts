import { Kysely } from "kysely";
import { Database } from "@authhero/kysely-adapter";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("email_providers")
    .addColumn("tenant_id", "varchar(255)", (col) => col.primaryKey())
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("enabled", "boolean", (col) => col.notNull())
    .addColumn("default_from_address", "varchar(255)")
    .addColumn("credentials", "varchar(2048)", (col) =>
      col.notNull().defaultTo("{}"),
    )
    .addColumn("settings", "varchar(2048)", (col) =>
      col.notNull().defaultTo("{}"),
    )
    .addColumn("created_at", "varchar(29)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(29)", (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("email_providers").execute();
}
