import { Kysely } from "kysely";
import { Database } from "../db";
import { isoToDbDate } from "../utils/dateConversion";

/**
 * Soft-revoke every unrevoked refresh token owned by a session.
 *
 * One hop on the `(tenant_id, session_id)` index rather than resolving through
 * the login session, which only ever records the session's *originating*
 * authorization transaction and so misses tokens minted in later SSO
 * re-authorizations.
 *
 * `revoked_at_ts IS NULL` keeps this idempotent and concurrency-safe — a
 * second revocation cannot overwrite the audit timestamp written by the first.
 */
export function revokeBySession(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    session_id: string,
    revoked_at: string,
  ): Promise<number> => {
    const results = await db
      .updateTable("refresh_tokens")
      .set({ revoked_at_ts: isoToDbDate(revoked_at) })
      .where("tenant_id", "=", tenant_id)
      .where("session_id", "=", session_id)
      .where("revoked_at_ts", "is", null)
      .executeTakeFirst();

    return Number(results.numUpdatedRows ?? 0);
  };
}
