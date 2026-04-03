import { Kysely } from "kysely";
import { OutboxEvent, AuditEvent } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function getUnprocessedOutboxEvents(db: Kysely<Database>) {
  return async (limit: number): Promise<OutboxEvent[]> => {
    const now = new Date().toISOString();

    const rows = await db
      .selectFrom("outbox_events")
      .selectAll()
      .where("processed_at", "is", null)
      .where((eb) =>
        eb.or([
          eb("next_retry_at", "is", null),
          eb("next_retry_at", "<=", now),
        ]),
      )
      .orderBy("created_at", "asc")
      .orderBy("id", "asc")
      .limit(limit)
      .execute();

    return rows.map((row) => {
      const payload = JSON.parse(row.payload) as AuditEvent;
      return {
        ...payload,
        created_at: row.created_at,
        processed_at: row.processed_at,
        retry_count: row.retry_count,
        next_retry_at: row.next_retry_at,
        error: row.error,
      };
    });
  };
}
