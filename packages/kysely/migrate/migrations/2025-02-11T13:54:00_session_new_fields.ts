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
export async function up(db: Kysely<Database>): Promise<void> {
  // Annoying.. we need to add each column separately
  await db.schema
    .alterTable("sessions")
    // This is how it's named in auth0. We'll make it a primary key in the next migration. It's a nanoId so 21 characters long.
    .addColumn("id", "varchar(21)")
    .execute();

  await db.schema
    .alterTable("sessions")
    // ISO Date, max 35 characters long
    .addColumn("idle_expires_at", "varchar(35)")
    .execute();

  await db.schema
    .alterTable("sessions")
    // ISO Date, max 35 characters long
    .addColumn("updated_at", "varchar(35)")
    .execute();

  await db.schema
    .alterTable("sessions")
    // ISO Date, max 35 characters long
    .addColumn("authenticated_at", "varchar(35)")
    .execute();

  await db.schema
    .alterTable("sessions")
    // ISO Date, max 35 characters long
    .addColumn("revoked_at", "varchar(35)")
    .execute();

  await db.schema
    .alterTable("sessions")
    // ISO Date, max 35 characters long
    .addColumn("last_interaction_at", "varchar(35)")
    .execute();

  await db.schema
    .alterTable("sessions")
    // Contains a json blob with user agents.
    .addColumn("device", "varchar(2048)")
    .execute();

  await db.schema
    .alterTable("sessions")
    // Contains a json array with client ids.
    .addColumn("clients", "varchar(1024)")
    .execute();

  // Change the expires_at column to be a varchar(35) that is nullable
  await db.schema.alterTable("sessions").dropColumn("expires_at").execute();
  await db.schema
    .alterTable("sessions")
    .addColumn("expires_at", "varchar(35)")
    .execute();
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
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("sessions")
    .dropColumn("id")
    .dropColumn("idle_expires_at")
    .dropColumn("updated_at")
    .dropColumn("revoked_at")
    .dropColumn("authenticated_at")
    .dropColumn("last_interaction_at")
    .dropColumn("device")
    .dropColumn("clients")
    .execute();
}
