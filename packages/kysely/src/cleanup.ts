import { Kysely } from "kysely";
import { Database } from "./db";

/**
 * Cleanup expired sessions and tokens using bigint timestamps (_ts columns).
 */
export function createCleanup(db: Kysely<Database>) {
  return async () => {
    const now = Date.now();
    const oneDayAgoMs = now - 1000 * 60 * 60 * 24;
    const oneWeekAgoMs = now - 1000 * 60 * 60 * 24 * 7;
    const threeMonthsAgoMs = now - 1000 * 60 * 60 * 24 * 30 * 3;

    // ISO strings for comparison with varchar dates (codes table still uses varchar)
    const oneDayAgoIso = new Date(oneDayAgoMs).toISOString();
    const threeMonthsAgoIso = new Date(threeMonthsAgoMs).toISOString();

    console.log("delete codes");
    await db
      .deleteFrom("codes")
      .where("created_at", "<", oneDayAgoIso)
      .limit(100000)
      .execute();

    console.log("delete login_sessions");
    // Use bigint timestamp column for login_sessions
    await db
      .deleteFrom("login_sessions")
      .where("created_at_ts", "<", oneWeekAgoMs)
      .where("session_id", "is", null)
      .limit(100000)
      .execute();

    console.log("delete logs");
    await db
      .deleteFrom("logs")
      .where("date", "<", threeMonthsAgoIso)
      .limit(100000)
      .execute();

    console.log("delete refresh tokens");
    // Use bigint timestamp columns for refresh_tokens
    await db
      .deleteFrom("refresh_tokens")
      .where((eb) =>
        eb.or([
          eb("expires_at_ts", "<", oneWeekAgoMs),
          eb("idle_expires_at_ts", "<", oneWeekAgoMs),
        ]),
      )
      .limit(10000)
      .execute();

    console.log("delete sessions");
    // Cleanup sessions that are older than one week and have no associated refresh_tokens
    // Use bigint timestamp columns
    const expiredSessionIds = await db
      .selectFrom("sessions")
      .select("id")
      .where((eb) =>
        eb.or([
          eb("expires_at_ts", "<", oneWeekAgoMs),
          eb("idle_expires_at_ts", "<", oneWeekAgoMs),
        ]),
      )
      .where(
        "id",
        "not in",
        db.selectFrom("refresh_tokens").select("session_id"),
      )
      .limit(100000)
      .execute();

    if (expiredSessionIds.length > 0) {
      await db
        .deleteFrom("sessions")
        .where(
          "id",
          "in",
          expiredSessionIds.map((s) => s.id),
        )
        .execute();
    }

    console.log("cleanup complete");
  };
}
