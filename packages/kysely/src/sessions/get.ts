import { Session } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";

export function get(db: Kysely<Database>) {
  return async (tenant_id: string, id: string): Promise<Session | null> => {
    const session = await db
      .selectFrom("sessions")
      .where("sessions.tenant_id", "=", tenant_id)
      .where("sessions.id", "=", id)
      .where("sessions.revoked_at", "is", null)
      .selectAll()
      .executeTakeFirst();

    if (!session) {
      return null;
    }

    const { tenant_id: _, device, clients, ...rest } = session;

    const idWithfallback = rest.id || rest.session_id || "";

    return {
      ...rest,
      id: idWithfallback,
      device: JSON.parse(device),
      clients: JSON.parse(clients),
    };
  };
}
