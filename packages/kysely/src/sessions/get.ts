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
      created_at_ts,
      updated_at_ts,
      expires_at_ts,
      idle_expires_at_ts,
      authenticated_at_ts,
      last_interaction_at_ts,
      used_at_ts,
      revoked_at_ts,
      ...rest
    } = session;

    // Convert dates from DB format (bigint) to ISO strings
    const dates = convertDatesToAdapter(
      { created_at_ts, updated_at_ts, expires_at_ts, idle_expires_at_ts, authenticated_at_ts, last_interaction_at_ts, used_at_ts, revoked_at_ts },
      ["created_at_ts", "updated_at_ts", "authenticated_at_ts", "last_interaction_at_ts"],
      ["expires_at_ts", "idle_expires_at_ts", "used_at_ts", "revoked_at_ts"],
    ) as {
      created_at: string;
      updated_at: string;
      authenticated_at: string;
      last_interaction_at: string;
      expires_at?: string;
      idle_expires_at?: string;
      used_at?: string;
      revoked_at?: string;
    };

    return {
      ...rest,
      ...dates,
      device: JSON.parse(device),
      clients: JSON.parse(clients),
    };
  };
}
