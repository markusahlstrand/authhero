import { Kysely } from "kysely";
import { Database } from "../db";

/**
 * Move an outbox event to dead-letter state. `processed_at` is also set so the
 * relay stops considering it, while `dead_lettered_at` and `final_error`
 * remain available for the management API's failed-events endpoints.
 */
export function deadLetterOutboxEvent(db: Kysely<Database>) {
  return async (id: string, finalError: string): Promise<void> => {
    const now = new Date().toISOString();
    await db
      .updateTable("outbox_events")
      .set({
        processed_at: now,
        dead_lettered_at: now,
        final_error: finalError,
      })
      .where("id", "=", id)
      .execute();
  };
}
