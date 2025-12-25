import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("resource_servers")
    .addColumn("is_system", "integer", (col) => col.defaultTo(0).notNull())
    .execute();

  await db.schema
    .alterTable("roles")
    .addColumn("is_system", "integer", (col) => col.defaultTo(0).notNull())
    .execute();

  await db.schema
    .alterTable("connections")
    .addColumn("is_system", "integer", (col) => col.defaultTo(0).notNull())
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("resource_servers").dropColumn("is_system").execute();

  await db.schema.alterTable("roles").dropColumn("is_system").execute();

  await db.schema.alterTable("connections").dropColumn("is_system").execute();
}
