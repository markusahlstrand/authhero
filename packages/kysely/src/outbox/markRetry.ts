import { Kysely, sql } from "kysely";
import { Database } from "../db";

export function markOutboxEventRetry(db: Kysely<Database>) {
  return async (
    id: string,
    error: string,
    nextRetryAt: string,
  ): Promise<void> => {
    await db
      .updateTable("outbox_events")
      .set({
        error,
        next_retry_at: nextRetryAt,
        retry_count: sql`retry_count + 1`,
        claimed_by: null,
        claim_expires_at: null,
      })
      .where("id", "=", id)
      .execute();
  };
}
