import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Executes the "up" migration to add new columns to the "sessions" table.
 *
 * This function sequentially modifies the "sessions" table by adding several new columns:
 * - **id**: A `varchar(21)` column intended for nanoId values; will become the primary key in a future migration.
 * - **idle_expires_at**: A `varchar(35)` column for storing ISO date strings representing idle expiration times.
 * - **updated_at**: A `varchar(35)` column for storing ISO date strings representing the last update time.
 * - **authenticated_at**: A `varchar(35)` column for storing ISO date strings representing authentication times.
 * - **revoked_at**: A `varchar(35)` column for storing ISO date strings representing revocation times.
 * - **last_interaction_at**: A `varchar(35)` column for storing ISO date strings representing the last interaction time.
 * - **device**: A `varchar(2048)` column for storing a JSON blob of user agent details.
 * - **clients**: A `varchar(1024)` column for storing a JSON array of client IDs.
 *
 * Additionally, the function modifies the existing **expires_at** column by dropping it and then re-adding it as a nullable `varchar(35)`.
 *
 * @param db - The Kysely database instance used for running schema alteration queries.
 * @returns A promise that resolves when all migration operations have been successfully executed.
 *
 * @throws Propagates any errors encountered during the database operations.
 */
export async function up(_: Kysely<Database>): Promise<void> {
  // Moved to earlie migration
}

/**
 * Performs the down migration by removing additional columns from the "sessions" table.
 *
 * This function reverses the changes made in the up migration by dropping the following columns:
 * - id
 * - idle_expires_at
 * - updated_at
 * - revoked_at
 * - authenticated_at
 * - last_interaction_at
 * - device
 * - clients
 *
 * @param db - The Kysely database instance used to execute the migration.
 *
 * @throws Propagates any errors thrown during the schema alteration.
 */
export async function down(_: Kysely<any>): Promise<void> {}
