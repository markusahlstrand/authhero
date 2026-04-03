import { Kysely } from "kysely";
import { Database } from "../db";

export function markOutboxEventsProcessed(db: Kysely<Database>) {
  return async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;

    const now = new Date().toISOString();

    await db
      .updateTable("outbox_events")
      .set({ processed_at: now })
      .where("id", "in", ids)
      .execute();
  };
}
