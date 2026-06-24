import { Kysely } from "kysely";
import { Database } from "../db";
import { Session } from "@authhero/adapter-interfaces";
import { isoToDbDate } from "../utils/dateConversion";

export function update(db: Kysely<Database>) {
  return async (tenant_id: string, id: string, session: Partial<Session>) => {
    const now = Date.now();

    // Convert ISO date strings to bigint timestamps for DB
    const sqlSession: Record<string, unknown> = {
      updated_at_ts: now,
      device: session.device ? JSON.stringify(session.device) : undefined,
      clients: session.clients ? JSON.stringify(session.clients) : undefined,
    };

    // Convert date fields if provided
    let expiresAtTs: number | null | undefined;
    let idleExpiresAtTs: number | null | undefined;
    if (session.expires_at !== undefined) {
      expiresAtTs = isoToDbDate(session.expires_at);
      sqlSession.expires_at_ts = expiresAtTs;
    }
    if (session.idle_expires_at !== undefined) {
      idleExpiresAtTs = isoToDbDate(session.idle_expires_at);
      sqlSession.idle_expires_at_ts = idleExpiresAtTs;
    }
    if (session.authenticated_at !== undefined) {
      sqlSession.authenticated_at_ts = isoToDbDate(session.authenticated_at);
    }
    if (session.last_interaction_at !== undefined) {
      sqlSession.last_interaction_at_ts = isoToDbDate(
        session.last_interaction_at,
      );
    }
    if (session.used_at !== undefined) {
      sqlSession.used_at_ts = isoToDbDate(session.used_at);
    }
    if (session.revoked_at !== undefined) {
      sqlSession.revoked_at_ts = isoToDbDate(session.revoked_at);
    }

    // Copy non-date fields
    if (session.user_id !== undefined) {
      sqlSession.user_id = session.user_id;
    }
    if (session.login_session_id !== undefined) {
      sqlSession.login_session_id = session.login_session_id;
    }

    const results = await db
      .updateTable("sessions")
      .set(sqlSession)
      .where("tenant_id", "=", tenant_id)
      .where("sessions.id", "=", id)
      .execute();

    // When a session is renewed (its expiry slides forward), keep the parent
    // login_session alive at least as long. Best-effort and idempotent
    // (WHERE expires_at_ts < new), mirroring refreshTokens.update — so it works
    // even when this update runs inside an outer transaction (e.g. logout) and
    // a failure never rejects the caller. Only fires when an expiry field moved.
    const newLoginSessionExpiry = Math.max(
      expiresAtTs ?? 0,
      idleExpiresAtTs ?? 0,
    );
    if (newLoginSessionExpiry > 0) {
      // Resolve the parent login_session via the session row when the caller
      // didn't pass it, so we avoid an extra round trip. The `expires_at_ts < ?`
      // predicate keeps the "never shorten" check atomic at the statement level.
      const loginSessionId =
        session.login_session_id ??
        db
          .selectFrom("sessions")
          .select("login_session_id")
          .where("tenant_id", "=", tenant_id)
          .where("id", "=", id);

      await db
        .updateTable("login_sessions")
        .set({
          expires_at_ts: newLoginSessionExpiry,
          updated_at_ts: now,
        })
        .where("tenant_id", "=", tenant_id)
        .where("id", "=", loginSessionId)
        .where("expires_at_ts", "<", newLoginSessionExpiry)
        .execute()
        .catch(() => {});
    }

    return !!results.length;
  };
}
