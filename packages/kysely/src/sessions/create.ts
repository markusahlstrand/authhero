import { Kysely } from "kysely";
import { Session, SessionInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    session: SessionInsert,
  ): Promise<Session> => {
    const createdSession = {
      ...session,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      authenticated_at: new Date().toISOString(),
      last_interaction_at: new Date().toISOString(),
    };

    await db
      .insertInto("sessions")
      .values({
        ...createdSession,
        tenant_id,
        device: JSON.stringify(session.device),
        clients: JSON.stringify(session.clients),
      })
      .execute();

    return createdSession;
  };
}
