import { Kysely } from "kysely";
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
export declare function up(db: Kysely<Database>): Promise<void>;
export declare function down(db: Kysely<Database>): Promise<void>;
