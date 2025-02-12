import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: adds missing fields to the sessions.
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
 * Down migration: drops the added sessions table fields
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
