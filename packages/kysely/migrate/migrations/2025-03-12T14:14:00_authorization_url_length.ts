import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: Add a new custom domains table
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("logins")
    .dropColumn("authorization_url")
    .execute();

  await db.schema
    .alterTable("logins")
    .addColumn("authorization_url", "varchar(2048)")
    .execute();
}

/**
 * Down migration: restore the domains table
 */
export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("logins")
    .dropColumn("authorization_url")
    .execute();

  await db.schema
    .alterTable("logins")
    .addColumn("authorization_url", "varchar(1024)")
    .execute();
}
