import { Kysely } from "kysely";
import { Database } from "../db";

/**
 * Reset a dead-lettered outbox event so the relay retries it on the next pass.
 * Clears processed_at, dead_lettered_at, final_error, retry_count, and
 * next_retry_at. Scoped to tenantId so management-API callers can't reach
 * into another tenant's dead-letter queue.
 *
 * Returns true if a row was updated (matched id + tenant + was dead-lettered),
 * false otherwise (so the route handler's 404 branch still works).
 */
export function replayOutboxEvent(db: Kysely<Database>) {
  return async (id: string, tenantId: string): Promise<boolean> => {
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
      .where("tenant_id", "=", tenantId)
      .where("dead_lettered_at", "is not", null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) > 0;
  };
}
