import { Kysely } from "kysely";
import { Database } from "../db";
import { isoToDbDate } from "../utils/dateConversion";

/**
 * Soft-revoke every unrevoked refresh token belonging to a user.
 *
 * Exact tenant + user predicates rather than a `q` filter: the Lucene grammar
 * splits on ` OR ` before tokenizing, so a crafted user id can widen the match
 * to another user's rows.
 *
 * `revoked_at_ts IS NULL` keeps this idempotent and concurrency-safe — a second
 * revocation cannot overwrite the audit timestamp written by the first.
 */
export function revokeByUser(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    user_id: string,
    revoked_at: string,
  ): Promise<number> => {
    const results = await db
      .updateTable("refresh_tokens")
      .set({ revoked_at_ts: isoToDbDate(revoked_at) })
      .where("tenant_id", "=", tenant_id)
      .where("user_id", "=", user_id)
      .where("revoked_at_ts", "is", null)
      .executeTakeFirst();

    return Number(results.numUpdatedRows ?? 0);
  };
}
