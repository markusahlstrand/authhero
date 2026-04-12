import { and, eq, lt, or } from "drizzle-orm";
import { sessions, refreshTokens, loginSessions } from "../schema/sqlite";
import type { SessionCleanupParams } from "@authhero/adapter-interfaces";
import type { DrizzleDb } from "./types";

const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

export function createSessionCleanup(db: DrizzleDb) {
  return async (params?: SessionCleanupParams): Promise<void> => {
    const cutoffTime = Date.now() - GRACE_PERIOD_MS;

    try {
      // Delete expired refresh tokens
      let conditions: any[] = [
        or(
          lt(refreshTokens.expires_at_ts, cutoffTime),
          lt(refreshTokens.idle_expires_at_ts, cutoffTime),
        ),
      ];
      if (params?.tenant_id) {
        conditions.push(eq(refreshTokens.tenant_id, params.tenant_id));
      }

      await db.delete(refreshTokens).where(and(...conditions));

      // Delete expired sessions
      conditions = [
        or(
          lt(sessions.expires_at_ts, cutoffTime),
          lt(sessions.idle_expires_at_ts, cutoffTime),
        ),
      ];
      if (params?.tenant_id) {
        conditions.push(eq(sessions.tenant_id, params.tenant_id));
      }
      if (params?.user_id) {
        conditions.push(eq(sessions.user_id, params.user_id));
      }

      await db.delete(sessions).where(and(...conditions));

      // Delete expired login sessions
      conditions = [lt(loginSessions.expires_at_ts, cutoffTime)];
      if (params?.tenant_id) {
        conditions.push(eq(loginSessions.tenant_id, params.tenant_id));
      }

      await db.delete(loginSessions).where(and(...conditions));
    } catch (error) {
      console.error("Session cleanup error:", error);
    }
  };
}
