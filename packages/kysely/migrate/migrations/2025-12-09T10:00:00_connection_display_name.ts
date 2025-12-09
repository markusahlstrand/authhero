import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("connections")
    .addColumn("display_name", "varchar(255)")
    .execute();

  await db.schema
    .alterTable("connections")
    .addColumn("is_domain_connection", "integer")
    .execute();

  await db.schema
    .alterTable("connections")
    .addColumn("show_as_button", "integer")
    .execute();

  await db.schema
    .alterTable("connections")
    .addColumn("metadata", "varchar(4096)")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("connections")
    .dropColumn("display_name")
    .execute();

  await db.schema
    .alterTable("connections")
    .dropColumn("is_domain_connection")
    .execute();

  await db.schema
    .alterTable("connections")
    .dropColumn("show_as_button")
    .execute();

  await db.schema.alterTable("connections").dropColumn("metadata").execute();
}
