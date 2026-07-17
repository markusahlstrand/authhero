import { Kysely } from "kysely";
import { Session, SessionInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { nowIso, isoToDbDate } from "../utils/dateConversion";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    session: SessionInsert,
  ): Promise<Session> => {
    const now = Date.now();
    const nowStr = nowIso();

    // Return value uses ISO strings (adapter interface)
    const createdSession: Session = {
      ...session,
      created_at: nowStr,
      updated_at: nowStr,
      authenticated_at: nowStr,
      last_interaction_at: nowStr,
    };

    // Database uses bigint timestamps with _ts suffix
    // Exclude old date fields from session object
    const {
      expires_at,
      idle_expires_at,
      used_at,
      revoked_at,
      device,
      clients,
      ...sessionWithoutDates
    } = session;

    const expiresAtTs = isoToDbDate(expires_at);
    const idleExpiresAtTs = isoToDbDate(idle_expires_at);
    // Keep the parent login_session alive at least as long as this session's
    // furthest-out expiry. See the "never shorten" predicate below.
    const newLoginSessionExpiry = Math.max(
      expiresAtTs ?? 0,
      idleExpiresAtTs ?? 0,
    );

    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto("sessions")
        .values({
          ...sessionWithoutDates,
          tenant_id,
          created_at_ts: now,
          updated_at_ts: now,
          authenticated_at_ts: now,
          last_interaction_at_ts: now,
          expires_at_ts: expiresAtTs,
          idle_expires_at_ts: idleExpiresAtTs,
          used_at_ts: isoToDbDate(used_at),
          revoked_at_ts: isoToDbDate(revoked_at),
          device: JSON.stringify(device),
          clients: JSON.stringify(clients),
        })
        .execute();

      if (newLoginSessionExpiry > 0 && session.login_session_id) {
        // Keep the parent login_session alive at least as long as this session.
        // The `expires_at_ts < ?` predicate makes this "never shorten" atomic,
        // mirroring refreshTokens.create. Without it, a long-lived session can
        // outlive its login_session and get orphaned when cleanup reaps the
        // login_session.
        await trx
          .updateTable("login_sessions")
          .set({
            expires_at_ts: newLoginSessionExpiry,
            updated_at_ts: now,
          })
          .where("tenant_id", "=", tenant_id)
          .where("id", "=", session.login_session_id)
          .where("expires_at_ts", "<", newLoginSessionExpiry)
          .execute();
      }
    });

    return createdSession;
  };
}
