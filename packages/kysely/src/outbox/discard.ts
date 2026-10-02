import { Kysely } from "kysely";
import { Database } from "../db";

/**
 * Permanently delete a dead-lettered outbox event. Scoped to tenantId and
 * restricted to dead-lettered rows, so this path can never remove a pending
 * or processed event, or reach into another tenant's dead-letter queue.
 *
 * Returns true if a row was deleted, false otherwise (so the route handler's
 * 404 branch still works).
 */
export function discardOutboxEvent(db: Kysely<Database>) {
  return async (id: string, tenantId: string): Promise<boolean> => {
    const result = await db
      .deleteFrom("outbox_events")
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .where("dead_lettered_at", "is not", null)
      .executeTakeFirst();

    return Number(result.numDeletedRows) > 0;
  };
}
