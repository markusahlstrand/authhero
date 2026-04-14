import { Kysely } from "kysely";
import {
  AuditEvent,
  ListFailedEventsResponse,
  ListParams,
  OutboxEvent,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function listFailedOutboxEvents(db: Kysely<Database>) {
  return async (
    tenantId: string,
    params: ListParams = {},
  ): Promise<ListFailedEventsResponse> => {
    const { page = 0, per_page = 50, include_totals = false } = params;

    const rows = await db
      .selectFrom("outbox_events")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("dead_lettered_at", "is not", null)
      .orderBy("dead_lettered_at", "desc")
      .orderBy("id", "asc")
      .offset(page * per_page)
      .limit(per_page)
      .execute();

    const events: OutboxEvent[] = rows.flatMap((row) => {
      let payload: AuditEvent;
      try {
        payload = JSON.parse(row.payload) as AuditEvent;
      } catch (err) {
        // A corrupt payload row shouldn't take down the whole failed-events
        // list — skip it and log so the operator can investigate directly.
        console.error(
          `Failed to parse outbox payload for event ${row.id}`,
          err,
        );
        return [];
      }
      return [
        {
          ...payload,
          id: row.id,
          created_at: row.created_at,
          processed_at: row.processed_at,
          retry_count: row.retry_count,
          next_retry_at: row.next_retry_at,
          error: row.error,
          dead_lettered_at: row.dead_lettered_at,
          final_error: row.final_error,
        },
      ];
    });

    let length = events.length;
    if (include_totals) {
      const [totals] = await db
        .selectFrom("outbox_events")
        .select((eb) => eb.fn.countAll<number>().as("total"))
        .where("tenant_id", "=", tenantId)
        .where("dead_lettered_at", "is not", null)
        .execute();
      length = Number(totals?.total ?? events.length);
    }

    return {
      events,
      start: page * per_page,
      limit: per_page,
      length,
    };
  };
}
