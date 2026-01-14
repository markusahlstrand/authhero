import { RefreshToken } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";
import { convertDatesToAdapter } from "../utils/dateConversion";

export function get(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    id: string,
  ): Promise<RefreshToken | null> => {
    const refreshToken = await db
      .selectFrom("refresh_tokens")
      .where("refresh_tokens.tenant_id", "=", tenant_id)
      .where("refresh_tokens.id", "=", id)
      .selectAll()
      .executeTakeFirst();

    if (!refreshToken) {
      return null;
    }

    const {
      tenant_id: _,
      created_at,
      expires_at,
      idle_expires_at,
      last_exchanged_at,
      ...rest
    } = refreshToken;

    // Convert dates from DB format (either string or bigint) to ISO strings
    const dates = convertDatesToAdapter(
      { created_at, expires_at, idle_expires_at, last_exchanged_at },
      ["created_at"],
      ["expires_at", "idle_expires_at", "last_exchanged_at"],
    );

    return {
      ...rest,
      ...dates,
      rotating: !!refreshToken.rotating,
      device: refreshToken.device ? JSON.parse(refreshToken.device) : {},
      resource_servers: refreshToken.resource_servers
        ? JSON.parse(refreshToken.resource_servers)
        : [],
    };
  };
}
