import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: Add phone_number and username
 */
export async function up(_: Kysely<Database>): Promise<void> {
  // Sqlite doesn't like this migration so it's merged into the init migration
  // await db.schema
  //   .alterTable("users")
  //   .addColumn("phone_number", "varchar(17)")
  //   .addColumn("phone_verified", "boolean")
  //   .addColumn("username", "varchar(128)")
  //   .alterColumn("email", "varchar(255)")
  //   .addUniqueConstraint("unique_phone_provider", [
  //     "phone_number",
  //     "provider",
  //     "tenant_id",
  //   ])
  //   .execute();
}

/**
 * Down migration: restore the domains table
 */
export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("users")
    .dropColumn("phone_number")
    .dropColumn("phone_verified")
    .dropColumn("username")
    .execute();
}
