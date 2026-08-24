import { RefreshToken } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";
import { toRefreshToken } from "./to-refresh-token";

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

    return toRefreshToken(refreshToken);
  };
}
