import { Kysely } from "kysely";
import { monotonicId } from "../utils/monotonic-id";
import {
  ListParams,
  ListTenantOperationEventsResult,
  TenantOperationEvent,
  TenantOperationEventInsert,
  TenantOperationEventsAdapter,
  tenantOperationEventInsertSchema,
  tenantOperationEventSchema,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";

type TenantOperationEventRow = Database["tenant_operation_events"];

function parseDetail(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(Object.entries(parsed));
    }
  } catch {
    /* fall through */
  }
  return null;
}

function rowToEvent(row: TenantOperationEventRow): TenantOperationEvent {
  return tenantOperationEventSchema.parse({
    id: row.id,
    operation_id: row.operation_id,
    step: row.step,
    outcome: row.outcome,
    detail: parseDetail(row.detail),
    attempt: row.attempt,
    created_at: row.created_at,
  });
}

export function createTenantOperationEventsAdapter(
  db: Kysely<Database>,
): TenantOperationEventsAdapter {
  return {
    async create(
      event: TenantOperationEventInsert,
    ): Promise<TenantOperationEvent> {
      const input = tenantOperationEventInsertSchema.parse(event);
      const row: TenantOperationEventRow = {
        // Monotonic so the `id asc` tiebreak preserves insertion order for
        // events created within the same millisecond.
        id: `evt_${monotonicId()}`,
        operation_id: input.operation_id,
        step: input.step,
        outcome: input.outcome,
        detail: input.detail ? JSON.stringify(input.detail) : null,
        attempt: input.attempt,
        created_at: new Date().toISOString(),
      };

      await db.insertInto("tenant_operation_events").values(row).execute();

      return rowToEvent(row);
    },

    async listByOperation(
      operation_id: string,
      params: ListParams = {},
    ): Promise<ListTenantOperationEventsResult> {
      const page = params.page ?? 0;
      const per_page = params.per_page ?? 100;

      const rows = await db
        .selectFrom("tenant_operation_events")
        .where("operation_id", "=", operation_id)
        .selectAll()
        .orderBy("created_at", "asc")
        .orderBy("id", "asc")
        .offset(page * per_page)
        .limit(per_page)
        .execute();

      return {
        events: rows.map(rowToEvent),
        start: page * per_page,
        limit: per_page,
        length: rows.length,
      };
    },
  };
}
