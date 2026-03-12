import { Kysely } from "kysely";
import { Database } from "./db";
import { SessionCleanupParams } from "@authhero/adapter-interfaces";

// Grace period: wait 1 week after expiration before deleting
const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Create a scoped session cleanup function that can filter by tenant and/or user.
 * This is designed for lazy cleanup after login session creation.
 *
 * Since login_sessions.expires_at is extended whenever refresh tokens or sessions
 * are renewed, we can simply delete expired records independently without
 * expensive subqueries to check for active children.
 *
 * Records are deleted only after they have been expired for the grace period (1 week).
 */
export function createSessionCleanup(db: Kysely<Database>) {
  return async (params?: SessionCleanupParams): Promise<void> => {
    const { tenant_id, user_id } = params || {};
    const now = Date.now();
    const cutoffTime = now - GRACE_PERIOD_MS;
    const BATCH_SIZE = 1000;

    try {
      // 1. Delete refresh_tokens in batches
      let deletedRefreshTokens = 0;
      while (true) {
        let refreshTokensQuery = db
          .deleteFrom("refresh_tokens")
          .where((eb) =>
            eb.or([
              eb("expires_at_ts", "<", cutoffTime),
              eb("idle_expires_at_ts", "<", cutoffTime),
            ]),
          );

        if (tenant_id) {
          refreshTokensQuery = refreshTokensQuery.where(
            "tenant_id",
            "=",
            tenant_id,
          );
        }
        if (user_id) {
          refreshTokensQuery = refreshTokensQuery.where("user_id", "=", user_id);
        }

        const result = await refreshTokensQuery.limit(BATCH_SIZE).execute();
        const deletedCount = Number(result[0]?.numDeletedRows ?? 0);
        deletedRefreshTokens += deletedCount;
        if (deletedCount < BATCH_SIZE) break;
      }

      // 2. Delete sessions in batches
      let deletedSessions = 0;
      while (true) {
        let sessionsQuery = db
          .deleteFrom("sessions")
          .where((eb) =>
            eb.or([
              eb("expires_at_ts", "<", cutoffTime),
              eb("idle_expires_at_ts", "<", cutoffTime),
            ]),
          );

        if (tenant_id) {
          sessionsQuery = sessionsQuery.where("tenant_id", "=", tenant_id);
        }
        if (user_id) {
          sessionsQuery = sessionsQuery.where("user_id", "=", user_id);
        }

        const result = await sessionsQuery.limit(BATCH_SIZE).execute();
        const deletedCount = Number(result[0]?.numDeletedRows ?? 0);
        deletedSessions += deletedCount;
        if (deletedCount < BATCH_SIZE) break;
      }

      // 3. Delete login_sessions in batches
      let deletedLoginSessions = 0;
      while (true) {
        let loginSessionsQuery = db
          .deleteFrom("login_sessions")
          .where("expires_at_ts", "<", cutoffTime);

        if (tenant_id) {
          loginSessionsQuery = loginSessionsQuery.where(
            "tenant_id",
            "=",
            tenant_id,
          );
        }
        if (user_id) {
          loginSessionsQuery = loginSessionsQuery.where("user_id", "=", user_id);
        }

        const result = await loginSessionsQuery.limit(BATCH_SIZE).execute();
        const deletedCount = Number(result[0]?.numDeletedRows ?? 0);
        deletedLoginSessions += deletedCount;
        if (deletedCount < BATCH_SIZE) break;
      }

      if (deletedRefreshTokens > 0 || deletedSessions > 0 || deletedLoginSessions > 0) {
        console.log(
          `Session cleanup: deleted ${deletedRefreshTokens} refresh_tokens, ${deletedSessions} sessions, ${deletedLoginSessions} login_sessions`,
        );
      }
    } catch (error) {
      // Log but don't throw - this is a background cleanup task
      console.error("Error during session cleanup:", error);
    }
  };
}
