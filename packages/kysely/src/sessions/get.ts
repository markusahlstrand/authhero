import { Session } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";
import { convertDatesToAdapter } from "../utils/dateConversion";

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

    const {
      tenant_id: _,
      device,
      clients,
      created_at,
      updated_at,
      expires_at,
      idle_expires_at,
      authenticated_at,
      last_interaction_at,
      used_at,
      revoked_at,
      ...rest
    } = session;

    // Convert dates from DB format (either string or bigint) to ISO strings
    const dates = convertDatesToAdapter(
      { created_at, updated_at, expires_at, idle_expires_at, authenticated_at, last_interaction_at, used_at, revoked_at },
      ["created_at", "updated_at", "authenticated_at", "last_interaction_at"],
      ["expires_at", "idle_expires_at", "used_at", "revoked_at"],
    );

    return {
      ...rest,
      ...dates,
      device: JSON.parse(device),
      clients: JSON.parse(clients),
    };
  };
}
