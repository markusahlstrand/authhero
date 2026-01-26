import { Database } from "../../src/db";
import { Kysely } from "kysely";

/**
 * Add missing OIDC profile claim columns to users table.
 * These are required for full OIDC Core 5.1 compliance:
 * - middle_name
 * - profile (URL of profile page)
 * - website
 * - gender
 * - birthdate (ISO 8601:2004 YYYY-MM-DD format)
 * - zoneinfo (e.g., "Europe/Paris")
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("users")
    .addColumn("middle_name", "varchar(255)")
    .execute();

  await db.schema
    .alterTable("users")
    .addColumn("profile", "varchar(2083)")
    .execute();

  await db.schema
    .alterTable("users")
    .addColumn("website", "varchar(2083)")
    .execute();

  await db.schema
    .alterTable("users")
    .addColumn("gender", "varchar(50)")
    .execute();

  await db.schema
    .alterTable("users")
    .addColumn("birthdate", "varchar(10)")
    .execute();

  await db.schema
    .alterTable("users")
    .addColumn("zoneinfo", "varchar(100)")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("users").dropColumn("middle_name").execute();
  await db.schema.alterTable("users").dropColumn("profile").execute();
  await db.schema.alterTable("users").dropColumn("website").execute();
  await db.schema.alterTable("users").dropColumn("gender").execute();
  await db.schema.alterTable("users").dropColumn("birthdate").execute();
  await db.schema.alterTable("users").dropColumn("zoneinfo").execute();
}
