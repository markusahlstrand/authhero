import { Kysely } from "kysely";
import { RefreshToken, RefreshTokenInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { nowDbDate, nowIso, isoToDbDate } from "../utils/dateConversion";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    refreshToken: RefreshTokenInsert,
  ): Promise<RefreshToken> => {
    const now = nowIso();
    const createdRefreshToken = {
      ...refreshToken,
      created_at: now,
    };

    // Write to DB with bigint timestamps
    const dbNow = nowDbDate();
    await db
      .insertInto("refresh_tokens")
      .values({
        ...createdRefreshToken,
        tenant_id,
        rotating: refreshToken.rotating ? 1 : 0,
        device: JSON.stringify(refreshToken.device),
        resource_servers: JSON.stringify(refreshToken.resource_servers),
        created_at: dbNow,
        expires_at: isoToDbDate(refreshToken.expires_at),
        idle_expires_at: refreshToken.idle_expires_at
          ? isoToDbDate(refreshToken.idle_expires_at)
          : null,
        last_exchanged_at: refreshToken.last_exchanged_at
          ? isoToDbDate(refreshToken.last_exchanged_at)
          : null,
      })
      .execute();

    return { ...refreshToken, ...createdRefreshToken };
  };
}
