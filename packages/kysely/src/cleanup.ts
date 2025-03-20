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

    await db
      .deleteFrom("codes")
      .where("created_at", "<", oneDayAgo)
      .limit(100000)
      .execute();
    await db
      .deleteFrom("login_sessions")
      .where("created_at", "<", oneWeekAgo)
      .where("session_id", "is", null)
      .limit(100000)
      .execute();
    await db
      .deleteFrom("logs")
      .where("date", "<", threeMonthsAgo)
      .limit(100000)
      .execute();

    await db
      .deleteFrom("refresh_tokens")
      .where("expires_at", "<", oneWeekAgo)
      .limit(100000)
      .execute();

    // Cleanup sessions that are older than one week and have no associated refresh_tokens
    await db
      .deleteFrom("sessions")
      .where((eb) =>
        eb.and([
          eb.or([
            eb("sessions.expires_at", "<", oneWeekAgo),
            eb("sessions.idle_expires_at", "<", oneWeekAgo),
          ]),
          eb(
            "sessions.id",
            "not in",
            db.selectFrom("refresh_tokens").select("session_id"),
          ),
        ]),
      )
      .limit(100000)
      .execute();
  };
}
