import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("resource_servers")
    .addColumn("synced", "integer", (col) => col.defaultTo(0).notNull())
    .execute();

  await db.schema
    .alterTable("roles")
    .addColumn("synced", "integer", (col) => col.defaultTo(0).notNull())
    .execute();

  await db.schema
    .alterTable("connections")
    .addColumn("synced", "integer", (col) => col.defaultTo(0).notNull())
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("resource_servers").dropColumn("synced").execute();

  await db.schema.alterTable("roles").dropColumn("synced").execute();

  await db.schema.alterTable("connections").dropColumn("synced").execute();
}
