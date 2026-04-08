import { Kysely } from "kysely";
import { nanoid } from "nanoid";
import { AuditEventInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function createOutboxEvent(db: Kysely<Database>) {
  return async (tenantId: string, event: AuditEventInsert): Promise<string> => {
    const id = nanoid();

    await db
      .insertInto("outbox_events")
      .values({
        id,
        tenant_id: tenantId,
        event_type: event.event_type,
        log_type: event.log_type,
        aggregate_type: event.target.type,
        aggregate_id: event.target.id,
        payload: JSON.stringify({ ...event, id }),
        created_at: new Date().toISOString(),
        processed_at: null,
        retry_count: 0,
        next_retry_at: null,
        error: null,
      })
      .execute();

    return id;
  };
}
