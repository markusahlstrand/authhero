import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Add `registration_completed_at` column to `users`.
 *
 * Set once all post-user-registration destinations (webhooks, code hooks, …)
 * have succeeded. `postUserLoginHook` re-enqueues the post-registration
 * event when this column is null so transient delivery failures are self-
 * healed on the user's next login instead of silently stuck in dead-letter.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("users")
    .addColumn("registration_completed_at", "varchar(35)")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("users")
    .dropColumn("registration_completed_at")
    .execute();
}
