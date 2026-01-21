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
    await db
      .insertInto("sessions")
      .values({
        ...sessionWithoutDates,
        tenant_id,
        created_at_ts: now,
        updated_at_ts: now,
        authenticated_at_ts: now,
        last_interaction_at_ts: now,
        expires_at_ts: isoToDbDate(expires_at),
        idle_expires_at_ts: isoToDbDate(idle_expires_at),
        used_at_ts: isoToDbDate(used_at),
        revoked_at_ts: isoToDbDate(revoked_at),
        device: JSON.stringify(device),
        clients: JSON.stringify(clients),
      })
      .execute();

    return createdSession;
  };
}
