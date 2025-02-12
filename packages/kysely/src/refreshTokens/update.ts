import { Kysely } from "kysely";
import { Database } from "../db";
import { RefreshToken } from "@authhero/adapter-interfaces";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    token: string,
    refresh_token: Partial<RefreshToken>,
  ) => {
    const updateData = {
      ...refresh_token,
      device: refresh_token.device
        ? JSON.stringify(refresh_token.device)
        : undefined,
      resource_servers: refresh_token.resource_servers
        ? JSON.stringify(refresh_token.resource_servers)
        : undefined,
      rotating: refresh_token.rotating ? 1 : 0,
    };

    const results = await db
      .updateTable("refresh_tokens")
      .set(updateData)
      .where("tenant_id", "=", tenant_id)
      .where("refresh_tokens.token", "=", token)
      .execute();

    return !!results.length;
  };
}
