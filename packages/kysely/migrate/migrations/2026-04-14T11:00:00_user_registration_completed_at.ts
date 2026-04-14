import { Kysely, sql } from "kysely";
import { Database } from "../../src/db";

/**
 * Add `registration_completed_at` column to `users`, then backfill it for
 * every row that already exists.
 *
 * `postUserLoginHook` re-enqueues a `hook.post-user-registration` event on
 * every login where this column is null. Without a backfill, every legacy
 * user would fire their post-registration webhooks and action code again on
 * their next login — customers would see duplicate "new user" events for
 * accounts that registered months or years earlier.
 *
 * Backfill to `created_at` so the column has a sensible timestamp that
 * doesn't cluster the entire userbase at migration time. That timestamp is
 * never exposed to consumers (only its null/non-null status is load-bearing
 * via `postUserLoginHook`).
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("users")
    .addColumn("registration_completed_at", "varchar(35)")
    .execute();

  await db
    .updateTable("users")
    .set({
      registration_completed_at: sql<string>`created_at` as unknown as string,
    })
    .where("registration_completed_at", "is", null)
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("users")
    .dropColumn("registration_completed_at")
    .execute();
}
