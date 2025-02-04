import { Kysely } from "kysely";
import { Database } from "../db";
import { RefreshToken } from "@authhero/adapter-interfaces";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    token: string,
    refresh_token: Partial<RefreshToken>,
  ) => {
    const results = await db
      .updateTable("refresh_tokens")
      .set(refresh_token)
      .where("tenant_id", "=", tenant_id)
      .where("refresh_tokens.token", "=", token)
      .execute();

    return !!results.length;
  };
}
