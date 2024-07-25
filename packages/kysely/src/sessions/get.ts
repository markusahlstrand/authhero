import { Session } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";

export function get(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    session_id: string,
  ): Promise<Session | null> => {
    const session = await db
      .selectFrom("sessions")
      .where("sessions.tenant_id", "=", tenant_id)
      .where("sessions.session_id", "=", session_id)
      .where("sessions.deleted_at", "is", null)
      .selectAll()
      .executeTakeFirst();

    return session ?? null;
  };
}
