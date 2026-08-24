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
      rotated_at,
      device,
      resource_servers,
      rotating,
      auth_strategy,
      ...tokenWithoutDates
    } = refreshToken;
    const nowTs = Date.now();
    const expiresAtTs = isoToDbDate(expires_at);
    const idleExpiresAtTs = idle_expires_at
      ? isoToDbDate(idle_expires_at)
      : null;
    const newLoginSessionExpiry = Math.max(
      expiresAtTs ?? 0,
      idleExpiresAtTs ?? 0,
    );

    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto("refresh_tokens")
        .values({
          ...tokenWithoutDates,
          tenant_id,
          rotating: rotating ? 1 : 0,
          // Flattened on write, re-nested on read (see list/get).
          auth_strategy_strategy: auth_strategy?.strategy ?? null,
          auth_strategy_strategy_type: auth_strategy?.strategy_type ?? null,
          device: JSON.stringify(device),
          resource_servers: JSON.stringify(resource_servers),
          created_at_ts: nowTs,
          expires_at_ts: expiresAtTs,
          idle_expires_at_ts: idleExpiresAtTs,
          last_exchanged_at_ts: last_exchanged_at
            ? isoToDbDate(last_exchanged_at)
            : null,
          rotated_at_ts: rotated_at ? isoToDbDate(rotated_at) : null,
        })
        .execute();

      if (newLoginSessionExpiry > 0 && refreshToken.login_id) {
        // Keep the parent login_session alive at least as long as this refresh token.
        // The `expires_at_ts < ?` predicate makes this "never shorten" atomic.
        await trx
          .updateTable("login_sessions")
          .set({
            expires_at_ts: newLoginSessionExpiry,
            updated_at_ts: nowTs,
          })
          .where("tenant_id", "=", tenant_id)
          .where("id", "=", refreshToken.login_id)
          .where("expires_at_ts", "<", newLoginSessionExpiry)
          .execute();
      }
    });

    return { ...refreshToken, ...createdRefreshToken };
  };
}
