import { Kysely } from "kysely";
import { Session, SessionInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { nowDbDate, nowIso, isoToDbDate } from "../utils/dateConversion";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    session: SessionInsert,
  ): Promise<Session> => {
    const now = nowDbDate();
    const nowStr = nowIso();

    // Return value uses ISO strings (adapter interface)
    const createdSession: Session = {
      ...session,
      created_at: nowStr,
      updated_at: nowStr,
      authenticated_at: nowStr,
      last_interaction_at: nowStr,
    };

    // Database uses bigint timestamps (new format)
    await db
      .insertInto("sessions")
      .values({
        ...session,
        tenant_id,
        created_at: now,
        updated_at: now,
        authenticated_at: now,
        last_interaction_at: now,
        expires_at: isoToDbDate(session.expires_at),
        idle_expires_at: isoToDbDate(session.idle_expires_at),
        used_at: isoToDbDate(session.used_at),
        revoked_at: isoToDbDate(session.revoked_at),
        device: JSON.stringify(session.device),
        clients: JSON.stringify(session.clients),
      })
      .execute();

    return createdSession;
  };
}
