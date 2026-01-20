import { Kysely } from "kysely";
import { Database } from "../db";
import { RefreshToken } from "@authhero/adapter-interfaces";
import { isoToDbDate } from "../utils/dateConversion";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    id: string,
    refresh_token: Partial<RefreshToken>,
  ) => {
    // Exclude old date fields from refresh token object
    const {
      created_at,
      expires_at,
      idle_expires_at,
      last_exchanged_at,
      device,
      resource_servers,
      rotating,
      ...tokenWithoutDates
    } = refresh_token;

    const updateData = {
      ...tokenWithoutDates,
      device: device ? JSON.stringify(device) : undefined,
      resource_servers: resource_servers
        ? JSON.stringify(resource_servers)
        : undefined,
      rotating: rotating !== undefined ? (rotating ? 1 : 0) : undefined,
      // Convert date fields to bigint format
      expires_at_ts: expires_at ? isoToDbDate(expires_at) : undefined,
      idle_expires_at_ts: idle_expires_at
        ? isoToDbDate(idle_expires_at)
        : undefined,
      last_exchanged_at_ts: last_exchanged_at
        ? isoToDbDate(last_exchanged_at)
        : undefined,
    };

    const results = await db
      .updateTable("refresh_tokens")
      .set(updateData)
      .where("tenant_id", "=", tenant_id)
      .where("refresh_tokens.id", "=", id)
      .execute();

    return !!results.length;
  };
}
