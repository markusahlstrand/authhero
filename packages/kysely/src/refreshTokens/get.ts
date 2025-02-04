import { RefreshToken } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";

export function get(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    refresh_token_id: string,
  ): Promise<RefreshToken | null> => {
    const refreshToken = await db
      .selectFrom("refresh_tokens")
      .where("refresh_tokens.tenant_id", "=", tenant_id)
      .where("refresh_tokens.session_id", "=", refresh_token_id)
      .where("refresh_tokens.revoked_at", "is", null)
      .selectAll()
      .executeTakeFirst();

    return refreshToken ?? null;
  };
}
