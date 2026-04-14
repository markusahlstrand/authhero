import { Kysely } from "kysely";
import { Database } from "../db";

/**
 * Reset a dead-lettered outbox event so the relay retries it on the next pass.
 * Clears processed_at, dead_lettered_at, final_error, retry_count, and
 * next_retry_at. Returns true if a row was updated.
 */
export function replayOutboxEvent(db: Kysely<Database>) {
  return async (id: string): Promise<boolean> => {
    const result = await db
      .updateTable("outbox_events")
      .set({
        processed_at: null,
        dead_lettered_at: null,
        final_error: null,
        retry_count: 0,
        next_retry_at: null,
        error: null,
      })
      .where("id", "=", id)
      .where("dead_lettered_at", "is not", null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) > 0;
  };
}
