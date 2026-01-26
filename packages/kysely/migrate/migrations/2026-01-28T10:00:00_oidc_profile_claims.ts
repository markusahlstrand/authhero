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
 *
 * Also converts user_metadata from varchar(4096) to text to free up row space.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  // Convert user_metadata to text first to free up row space
  await db.schema.alterTable("users").dropColumn("user_metadata").execute();
  await db.schema
    .alterTable("users")
    .addColumn("user_metadata", "text")
    .execute();

  await db.schema
    .alterTable("users")
    .addColumn("middle_name", "varchar(100)")
    .execute();

  // Using text for URL fields to avoid row size limits
  await db.schema.alterTable("users").addColumn("profile", "text").execute();

  await db.schema.alterTable("users").addColumn("website", "text").execute();

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

  // Revert user_metadata back to varchar
  await db.schema.alterTable("users").dropColumn("user_metadata").execute();
  await db.schema
    .alterTable("users")
    .addColumn("user_metadata", "varchar(4096)")
    .execute();
}
