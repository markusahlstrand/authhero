import { Kysely } from "kysely";
import { OutboxEvent, AuditEvent } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function getOutboxEventsByIds(db: Kysely<Database>) {
  return async (ids: string[]): Promise<OutboxEvent[]> => {
    if (ids.length === 0) return [];

    const rows = await db
      .selectFrom("outbox_events")
      .selectAll()
      .where("id", "in", ids)
      .execute();

    return rows.map((row) => {
      const payload = JSON.parse(row.payload) as AuditEvent;
      return {
        ...payload,
        id: row.id,
        created_at: row.created_at,
        processed_at: row.processed_at,
        retry_count: row.retry_count,
        next_retry_at: row.next_retry_at,
        error: row.error,
      };
    });
  };
}
