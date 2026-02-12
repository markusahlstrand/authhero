import { Kysely } from "kysely";
import { Database } from "./db";
import { SessionCleanupParams } from "@authhero/adapter-interfaces";

/**
 * Create a scoped session cleanup function that can filter by tenant and/or user.
 * This is designed for lazy cleanup after login session creation.
 */
export function createSessionCleanup(db: Kysely<Database>) {
  return async (params?: SessionCleanupParams): Promise<void> => {
    const { tenant_id, user_id } = params || {};
    const now = Date.now();

    try {
      // 1. Delete expired login_sessions that don't have active sessions connected
      // Build subquery for login_sessions that have active sessions
      let activeSessionsQuery = db
        .selectFrom("sessions")
        .select("login_session_id")
        .where("login_session_id", "is not", null)
        .where((eb) =>
          eb.and([
            eb.or([
              eb("expires_at_ts", "is", null),
              eb("expires_at_ts", ">=", now),
            ]),
            eb.or([
              eb("idle_expires_at_ts", "is", null),
              eb("idle_expires_at_ts", ">=", now),
            ]),
          ]),
        );

      if (tenant_id) {
        activeSessionsQuery = activeSessionsQuery.where(
          "tenant_id",
          "=",
          tenant_id,
        );
      }
      if (user_id) {
        activeSessionsQuery = activeSessionsQuery.where(
          "user_id",
          "=",
          user_id,
        );
      }

      let loginSessionsQuery = db
        .deleteFrom("login_sessions")
        .where("expires_at_ts", "<", now)
        .where("id", "not in", activeSessionsQuery);

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

      await loginSessionsQuery.limit(1000).execute();

      // 2. Delete expired refresh_tokens
      let refreshTokensQuery = db
        .deleteFrom("refresh_tokens")
        .where((eb) =>
          eb.or([
            eb("expires_at_ts", "<", now),
            eb("idle_expires_at_ts", "<", now),
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

      await refreshTokensQuery.limit(1000).execute();

      // 3. Delete expired sessions that have no active refresh tokens
      // First, get IDs of sessions with active refresh tokens
      let activeRefreshTokensQuery = db
        .selectFrom("refresh_tokens")
        .select("session_id")
        .where((eb) =>
          eb.and([
            eb.or([
              eb("expires_at_ts", "is", null),
              eb("expires_at_ts", ">=", now),
            ]),
            eb.or([
              eb("idle_expires_at_ts", "is", null),
              eb("idle_expires_at_ts", ">=", now),
            ]),
          ]),
        );

      if (tenant_id) {
        activeRefreshTokensQuery = activeRefreshTokensQuery.where(
          "tenant_id",
          "=",
          tenant_id,
        );
      }
      if (user_id) {
        activeRefreshTokensQuery = activeRefreshTokensQuery.where(
          "user_id",
          "=",
          user_id,
        );
      }

      // Build the sessions delete query
      let sessionsQuery = db
        .deleteFrom("sessions")
        .where((eb) =>
          eb.or([
            eb("expires_at_ts", "<", now),
            eb("idle_expires_at_ts", "<", now),
          ]),
        )
        .where("id", "not in", activeRefreshTokensQuery);

      if (tenant_id) {
        sessionsQuery = sessionsQuery.where("tenant_id", "=", tenant_id);
      }
      if (user_id) {
        sessionsQuery = sessionsQuery.where("user_id", "=", user_id);
      }

      await sessionsQuery.limit(1000).execute();
    } catch (error) {
      // Log but don't throw - this is a background cleanup task
      console.error("Error during session cleanup:", error);
    }
  };
}
