import { Session } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";

export function get(db: Kysely<Database>) {
  return async (tenant_id: string, id: string): Promise<Session | null> => {
    const session = await db
      .selectFrom("sessions")
      .where("sessions.tenant_id", "=", tenant_id)
      .where("sessions.id", "=", id)
      .selectAll()
      .executeTakeFirst();

    if (!session) {
      return null;
    }

    const { tenant_id: _, device, clients, ...rest } = session;

    return {
      ...rest,
      device: JSON.parse(device),
      clients: JSON.parse(clients),
    };
  };
}
