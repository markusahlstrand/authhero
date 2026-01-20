import { Kysely } from "kysely";
import { Database } from "../db";
import { Session } from "@authhero/adapter-interfaces";
import { isoToDbDate } from "../utils/dateConversion";

export function update(db: Kysely<Database>) {
  return async (tenant_id: string, id: string, session: Partial<Session>) => {
    // Convert ISO date strings to bigint timestamps for DB
    const sqlSession: Record<string, unknown> = {
      updated_at_ts: Date.now(),
      device: session.device ? JSON.stringify(session.device) : undefined,
      clients: session.clients ? JSON.stringify(session.clients) : undefined,
    };

    // Convert date fields if provided
    if (session.expires_at !== undefined) {
      sqlSession.expires_at_ts = isoToDbDate(session.expires_at);
    }
    if (session.idle_expires_at !== undefined) {
      sqlSession.idle_expires_at_ts = isoToDbDate(session.idle_expires_at);
    }
    if (session.authenticated_at !== undefined) {
      sqlSession.authenticated_at_ts = isoToDbDate(session.authenticated_at);
    }
    if (session.last_interaction_at !== undefined) {
      sqlSession.last_interaction_at_ts = isoToDbDate(session.last_interaction_at);
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

    return !!results.length;
  };
}
