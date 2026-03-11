import { Kysely } from "kysely";
import { Database } from "./db";
import { SessionCleanupParams } from "@authhero/adapter-interfaces";

/**
 * Create a scoped session cleanup function that can filter by tenant and/or user.
 * This is designed for lazy cleanup after login session creation.
 *
 * Since login_sessions.expires_at is extended whenever refresh tokens or sessions
 * are renewed, we can simply delete expired records independently without
 * expensive subqueries to check for active children.
 */
export function createSessionCleanup(db: Kysely<Database>) {
  return async (params?: SessionCleanupParams): Promise<void> => {
    const { tenant_id, user_id } = params || {};
    const now = Date.now();

    try {
      // 1. Delete expired refresh_tokens
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

      // 2. Delete expired sessions
      let sessionsQuery = db
        .deleteFrom("sessions")
        .where((eb) =>
          eb.or([
            eb("expires_at_ts", "<", now),
            eb("idle_expires_at_ts", "<", now),
          ]),
        );

      if (tenant_id) {
        sessionsQuery = sessionsQuery.where("tenant_id", "=", tenant_id);
      }
      if (user_id) {
        sessionsQuery = sessionsQuery.where("user_id", "=", user_id);
      }

      await sessionsQuery.limit(1000).execute();

      // 3. Delete expired login_sessions
      let loginSessionsQuery = db
        .deleteFrom("login_sessions")
        .where("expires_at_ts", "<", now);

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
    } catch (error) {
      // Log but don't throw - this is a background cleanup task
      console.error("Error during session cleanup:", error);
    }
  };
}
