import { Kysely } from "kysely";
import { RefreshToken, RefreshTokenInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    refreshToken: RefreshTokenInsert,
  ): Promise<RefreshToken> => {
    const createdRefreshToken = {
      ...refreshToken,
      created_at: new Date().toISOString(),
    };

    await db
      .insertInto("refresh_tokens")
      .values({
        ...createdRefreshToken,
        tenant_id,
        rotating: refreshToken.rotating ? 1 : 0,
        device: JSON.stringify(refreshToken.device),
        resource_servers: JSON.stringify(refreshToken.resource_servers),
      })
      .execute();

    return { ...refreshToken, ...createdRefreshToken };
  };
}
