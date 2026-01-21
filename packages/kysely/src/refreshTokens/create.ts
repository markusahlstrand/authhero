import { Kysely } from "kysely";
import { RefreshToken, RefreshTokenInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { nowIso, isoToDbDate } from "../utils/dateConversion";

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
    // Exclude old date fields from refresh token object
    const {
      expires_at,
      idle_expires_at,
      last_exchanged_at,
      device,
      resource_servers,
      rotating,
      ...tokenWithoutDates
    } = refreshToken;
    const nowTs = Date.now();
    await db
      .insertInto("refresh_tokens")
      .values({
        ...tokenWithoutDates,
        tenant_id,
        rotating: rotating ? 1 : 0,
        device: JSON.stringify(device),
        resource_servers: JSON.stringify(resource_servers),
        created_at_ts: nowTs,
        expires_at_ts: isoToDbDate(expires_at),
        idle_expires_at_ts: idle_expires_at
          ? isoToDbDate(idle_expires_at)
          : null,
        last_exchanged_at_ts: last_exchanged_at
          ? isoToDbDate(last_exchanged_at)
          : null,
      })
      .execute();

    return { ...refreshToken, ...createdRefreshToken };
  };
}
