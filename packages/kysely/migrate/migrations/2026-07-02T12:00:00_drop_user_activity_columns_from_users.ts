import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Contract phase of the user_activity split (issue #1003): the counters were
 * backfilled into `user_activity` and all reads/writes have been cut over, so
 * the legacy `users` columns can go. Requires the backfill script to have run
 * against the environment first — dropping the columns discards any values
 * that were never copied.
 *
 * Plain DROP COLUMN works on both dialects (SQLite ≥3.35 / D1 / MySQL); none
 * of these columns are indexed.
 */

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("users").dropColumn("last_login").execute();
  await db.schema.alterTable("users").dropColumn("last_ip").execute();
  await db.schema.alterTable("users").dropColumn("login_count").execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("users")
    .addColumn("last_login", "varchar(35)")
    .execute();
  await db.schema
    .alterTable("users")
    .addColumn("last_ip", "varchar(45)")
    .execute();
  await db.schema
    .alterTable("users")
    .addColumn("login_count", "integer", (col) => col.notNull().defaultTo(0))
    .execute();
}
