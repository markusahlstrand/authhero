import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: Add a new custom domains table
 */
export async function up(_: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("logins")
  //   .addColumn("organization", "varchar(256)")
  //   .addColumn("authorization_url", "varchar(1024)")
  //   .execute();
}

/**
 * Down migration: restore the domains table
 */
export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("logins")
    .dropColumn("authParams_organization")
    .dropColumn("authorization_url")
    .execute();
}
