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
      expires_at: new Date().toISOString(),
    };

    await db
      .insertInto("sessions")
      .values({ ...createdSession, tenant_id })
      .execute();

    return { ...session, ...createdSession };
  };
}
