import { RefreshToken } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";

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

    return {
      ...refreshToken,
      rotating: !!refreshToken.rotating,
      device: refreshToken.device ? JSON.parse(refreshToken.device) : {},
      resource_servers: refreshToken.resource_servers
        ? JSON.parse(refreshToken.resource_servers)
        : [],
    };
  };
}
