import { Database } from "../../src/db";
import { Kysely } from "kysely";

/**
 * Add address column to users table for OIDC address scope support.
 * The address claim is a JSON object as per OIDC Core 5.1.1 specification:
 * - formatted: Full mailing address
 * - street_address: Full street address
 * - locality: City or locality
 * - region: State, province, prefecture or region
 * - postal_code: Zip code or postal code
 * - country: Country name
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("users")
    .addColumn("address", "text")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("users").dropColumn("address").execute();
}
