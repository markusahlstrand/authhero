import { Kysely } from "kysely";
import { Database } from "../db";

export function cleanupOutboxEvents(db: Kysely<Database>) {
  return async (olderThan: string): Promise<number> => {
    // Delete processed events older than the retention cutoff
    const result = await db
      .deleteFrom("outbox_events")
      .where("processed_at", "is not", null)
      .where("processed_at", "<", olderThan)
      .executeTakeFirst();

    return Number(result.numDeletedRows);
  };
}
