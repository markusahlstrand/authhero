import { Kysely } from "kysely";
import { Database } from "./db";

export function createCleanup(db: Kysely<Database>) {
  return async () => {
    const oneDayAgo = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();

    const oneWeekAgo = new Date(
      Date.now() - 1000 * 60 * 60 * 24 * 7,
    ).toISOString();

    const threeMonthsAgo = new Date(
      Date.now() - 1000 * 60 * 60 * 24 * 30 * 3,
    ).toISOString();

    console.log("delete codes");
    await db
      .deleteFrom("codes")
      .where("created_at", "<", oneDayAgo)
      .limit(100000)
      .execute();

    console.log("delete sessions");

    await db
      .deleteFrom("login_sessions")
      .where("created_at", "<", oneWeekAgo)
      .where("session_id", "is", null)
      .limit(100000)
      .execute();

    console.log("delete logs");
    await db
      .deleteFrom("logs")
      .where("date", "<", threeMonthsAgo)
      .limit(100000)
      .execute();

    console.log("delete refresh tokens");
    await db
      .deleteFrom("refresh_tokens")
      .where((eb) =>
        eb.or([
          eb("expires_at", "<", oneWeekAgo),
          eb("idle_expires_at", "<", oneWeekAgo),
        ]),
      )
      .limit(10000)
      .execute();

    console.log("delete sessions");
    // Cleanup sessions that are older than one week and have no associated refresh_tokens
    const expiredSessionIds = await db
      .selectFrom("sessions")
      .select("id")
      .where((eb) =>
        eb.or([
          eb("expires_at", "<", oneWeekAgo),
          eb("idle_expires_at", "<", oneWeekAgo),
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
