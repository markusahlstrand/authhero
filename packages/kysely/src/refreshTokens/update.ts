import { Kysely } from "kysely";
import { Database } from "../db";
import {
  RefreshToken,
  UpdateRefreshTokenOptions,
} from "@authhero/adapter-interfaces";
import { isoToDbDate } from "../utils/dateConversion";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    id: string,
    refresh_token: Partial<RefreshToken>,
    options?: UpdateRefreshTokenOptions,
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

    const bump = options?.loginSessionBump;
    const newLoginSessionExpiry = bump ? isoToDbDate(bump.expires_at) : null;

    const tokenResult = await db
      .updateTable("refresh_tokens")
      .set(updateData)
      .where("tenant_id", "=", tenant_id)
      .where("refresh_tokens.id", "=", id)
      .executeTakeFirst();

    // Best-effort login_session bump. Idempotent (only extends, never
    // shortens, and the next refresh will re-bump on transient failure), so a
    // failure here must not reject the refresh exchange.
    if (bump?.login_id && newLoginSessionExpiry && newLoginSessionExpiry > 0) {
      await db
        .updateTable("login_sessions")
        .set({
          expires_at_ts: newLoginSessionExpiry,
          updated_at_ts: Date.now(),
        })
        .where("tenant_id", "=", tenant_id)
        .where("id", "=", bump.login_id)
        .where("expires_at_ts", "<", newLoginSessionExpiry)
        .execute()
        .catch(() => {});
    }

    return (tokenResult?.numUpdatedRows ?? 0n) > 0n;
  };
}
