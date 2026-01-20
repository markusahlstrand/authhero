import { Kysely } from "kysely";
import { Database } from "./db";

/**
 * During the migration transition period, date fields can be either:
 * - ISO string: "2024-01-15T10:00:00.000Z"
 * - Bigint timestamp: 1705315200000
 *
 * This cleanup handles both formats by checking if the value starts with "20" (ISO year).
 * For numeric comparisons, we compare directly since SQLite/MySQL handle numeric strings.
 * Once migration is complete, this can be simplified to just use bigint comparisons.
 */
export function createCleanup(db: Kysely<Database>) {
  return async () => {
    const now = Date.now();
    const oneDayAgoMs = now - 1000 * 60 * 60 * 24;
    const oneWeekAgoMs = now - 1000 * 60 * 60 * 24 * 7;
    const threeMonthsAgoMs = now - 1000 * 60 * 60 * 24 * 30 * 3;

    // ISO strings for comparison with varchar dates (before migration)
    const oneDayAgoIso = new Date(oneDayAgoMs).toISOString();
    const oneWeekAgoIso = new Date(oneWeekAgoMs).toISOString();
    const threeMonthsAgoIso = new Date(threeMonthsAgoMs).toISOString();

    // String representations of timestamps for numeric comparison
    // When stored as varchar, numeric comparison works because timestamps
    // have consistent length and lexicographic ordering matches numeric ordering
    const oneWeekAgoStr = String(oneWeekAgoMs);

    console.log("delete codes");
    await db
      .deleteFrom("codes")
      .where("created_at", "<", oneDayAgoIso)
      .limit(100000)
      .execute();

    console.log("delete login_sessions");
    // Handle both ISO strings and bigint timestamps for login_sessions
    // ISO strings start with "20" (year), timestamps start with "1" (Unix epoch)
    await db
      .deleteFrom("login_sessions")
      .where((eb) =>
        eb.or([
          // For ISO string dates (before migration) - lexicographic comparison works
          eb.and([
            eb("created_at", "like", "20%"),
            eb("created_at", "<", oneWeekAgoIso),
          ]),
          // For bigint timestamps (after migration) - stored as varchar, numeric string comparison
          // works because all timestamps have same length (13 digits) and start with "1"
          eb.and([
            eb("created_at", "not like", "20%"),
            eb("created_at", "<", oneWeekAgoStr),
          ]),
        ]),
      )
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
    // Handle both date formats for refresh_tokens
    await db
      .deleteFrom("refresh_tokens")
      .where((eb) =>
        eb.or([
          // For ISO string dates - expires_at
          eb.and([
            eb("expires_at", "like", "20%"),
            eb("expires_at", "<", oneWeekAgoIso),
          ]),
          // For bigint timestamps - expires_at
          eb.and([
            eb("expires_at", "not like", "20%"),
            eb("expires_at", "<", oneWeekAgoStr),
          ]),
          // For ISO string dates - idle_expires_at
          eb.and([
            eb("idle_expires_at", "like", "20%"),
            eb("idle_expires_at", "<", oneWeekAgoIso),
          ]),
          // For bigint timestamps - idle_expires_at
          eb.and([
            eb("idle_expires_at", "not like", "20%"),
            eb("idle_expires_at", "<", oneWeekAgoStr),
          ]),
        ]),
      )
      .limit(10000)
      .execute();

    console.log("delete sessions");
    // Cleanup sessions that are older than one week and have no associated refresh_tokens
    // Handle both date formats
    const expiredSessionIds = await db
      .selectFrom("sessions")
      .select("id")
      .where((eb) =>
        eb.or([
          // For ISO string dates - expires_at
          eb.and([
            eb("expires_at", "like", "20%"),
            eb("expires_at", "<", oneWeekAgoIso),
          ]),
          // For bigint timestamps - expires_at
          eb.and([
            eb("expires_at", "not like", "20%"),
            eb("expires_at", "<", oneWeekAgoStr),
          ]),
          // For ISO string dates - idle_expires_at
          eb.and([
            eb("idle_expires_at", "like", "20%"),
            eb("idle_expires_at", "<", oneWeekAgoIso),
          ]),
          // For bigint timestamps - idle_expires_at
          eb.and([
            eb("idle_expires_at", "not like", "20%"),
            eb("idle_expires_at", "<", oneWeekAgoStr),
          ]),
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
