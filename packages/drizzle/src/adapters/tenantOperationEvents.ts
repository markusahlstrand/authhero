import { asc, eq } from "drizzle-orm";
import { monotonicId } from "../helpers/monotonic-id";
import type {
  ListParams,
  ListTenantOperationEventsResult,
  TenantOperationEvent,
  TenantOperationEventInsert,
  TenantOperationEventsAdapter,
} from "@authhero/adapter-interfaces";
import {
  tenantOperationEventInsertSchema,
  tenantOperationEventSchema,
} from "@authhero/adapter-interfaces";
import { tenantOperationEvents } from "../schema/control-plane";
import type { DrizzleDb } from "./types";

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

function rowToEvent(
  row: typeof tenantOperationEvents.$inferSelect,
): TenantOperationEvent {
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
  db: DrizzleDb,
): TenantOperationEventsAdapter {
  return {
    async create(
      event: TenantOperationEventInsert,
    ): Promise<TenantOperationEvent> {
      const input = tenantOperationEventInsertSchema.parse(event);
      const row: typeof tenantOperationEvents.$inferInsert = {
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

      await db.insert(tenantOperationEvents).values(row);

      return tenantOperationEventSchema.parse({
        id: row.id,
        operation_id: row.operation_id,
        step: row.step,
        outcome: row.outcome,
        detail: input.detail ?? null,
        attempt: row.attempt,
        created_at: row.created_at,
      });
    },

    async listByOperation(
      operation_id: string,
      params: ListParams = {},
    ): Promise<ListTenantOperationEventsResult> {
      const page = params.page ?? 0;
      const per_page = params.per_page ?? 100;

      const rows = await db
        .select()
        .from(tenantOperationEvents)
        .where(eq(tenantOperationEvents.operation_id, operation_id))
        .orderBy(
          asc(tenantOperationEvents.created_at),
          asc(tenantOperationEvents.id),
        )
        .offset(page * per_page)
        .limit(per_page);

      return {
        events: rows.map(rowToEvent),
        start: page * per_page,
        limit: per_page,
        length: rows.length,
      };
    },
  };
}
