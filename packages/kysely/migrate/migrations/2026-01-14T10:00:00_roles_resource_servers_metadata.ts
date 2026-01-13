import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("roles")
    .addColumn("metadata", "varchar(4096)")
    .execute();

  await db.schema
    .alterTable("resource_servers")
    .addColumn("metadata", "varchar(4096)")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("roles").dropColumn("metadata").execute();

  await db.schema.alterTable("resource_servers").dropColumn("metadata").execute();
}
