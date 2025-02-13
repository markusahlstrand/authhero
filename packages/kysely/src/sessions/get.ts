import { Session } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";

export function get(db: Kysely<Database>) {
  return async (tenant_id: string, id: string): Promise<Session | null> => {
    const session = await db
      .selectFrom("sessions_2")
      .where("sessions_2.tenant_id", "=", tenant_id)
      .where("sessions_2.id", "=", id)
      .where("sessions_2.revoked_at", "is", null)
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
