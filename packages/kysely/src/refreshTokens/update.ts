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
      revoked_at,
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
      // Use !== undefined to preserve null values (which mean "doesn't expire")
      expires_at_ts:
        expires_at !== undefined ? isoToDbDate(expires_at) : undefined,
      idle_expires_at_ts:
        idle_expires_at !== undefined
          ? isoToDbDate(idle_expires_at)
          : undefined,
      last_exchanged_at_ts:
        last_exchanged_at !== undefined
          ? isoToDbDate(last_exchanged_at)
          : undefined,
      revoked_at_ts:
        revoked_at !== undefined ? isoToDbDate(revoked_at) : undefined,
    };

    return db.transaction().execute(async (trx) => {
      const results = await trx
        .updateTable("refresh_tokens")
        .set(updateData)
        .where("tenant_id", "=", tenant_id)
        .where("refresh_tokens.id", "=", id)
        .execute();

      const updated = !!results.length;

      // Only extend the parent login_session if the update actually changed an expiry.
      const expiryChanged =
        updateData.expires_at_ts !== undefined ||
        updateData.idle_expires_at_ts !== undefined;

      if (updated && expiryChanged) {
        const row = await trx
          .selectFrom("refresh_tokens")
          .select(["login_id", "expires_at_ts", "idle_expires_at_ts"])
          .where("tenant_id", "=", tenant_id)
          .where("refresh_tokens.id", "=", id)
          .executeTakeFirst();

        if (row?.login_id) {
          const newLoginSessionExpiry = Math.max(
            row.expires_at_ts ?? 0,
            row.idle_expires_at_ts ?? 0,
          );
          if (newLoginSessionExpiry > 0) {
            await trx
              .updateTable("login_sessions")
              .set({
                expires_at_ts: newLoginSessionExpiry,
                updated_at_ts: Date.now(),
              })
              .where("tenant_id", "=", tenant_id)
              .where("id", "=", row.login_id)
              .where("expires_at_ts", "<", newLoginSessionExpiry)
              .execute();
          }
        }
      }

      return updated;
    });
  };
}
