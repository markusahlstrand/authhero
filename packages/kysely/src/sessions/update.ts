import { Kysely } from "kysely";
import { Database } from "../db";
import { Session } from "@authhero/adapter-interfaces";

export function update(db: Kysely<Database>) {
  return async (tenant_id: string, id: string, session: Partial<Session>) => {
    const sqlSession = {
      ...session,
      updated_at: new Date().toISOString(),
      device: session.device ? JSON.stringify(session.device) : undefined,
      clients: session.clients ? JSON.stringify(session.clients) : undefined,
    };

    const results = await db
      .updateTable("sessions")
      .set(sqlSession)
      .where("tenant_id", "=", tenant_id)
      .where("sessions.id", "=", id)
      .execute();

    return !!results.length;
  };
}
