import {
  eq,
  and,
  isNull,
  isNotNull,
  lte,
  desc,
  or,
  sql,
  inArray,
  count as countFn,
} from "drizzle-orm";
import { nanoid } from "nanoid";
import type {
  ListFailedEventsResponse,
  ListParams,
  OutboxAdapter,
} from "@authhero/adapter-interfaces";
import { outboxEvents } from "../schema/sqlite";
import { parseJsonIfString } from "../helpers/transform";
import type { DrizzleDb } from "./types";

function sqlToOutboxEvent(row: any): any {
  return {
    ...row,
    payload: parseJsonIfString(row.payload, {}),
  };
}

export function createOutboxAdapter(db: DrizzleDb): OutboxAdapter {
  return {
    async create(tenant_id: string, event: any): Promise<string> {
      const id = nanoid();
      const now = new Date().toISOString();

      await db.insert(outboxEvents).values({
        id,
        tenant_id,
        event_type: event.event_type,
        log_type: event.log_type,
        aggregate_type: event.aggregate_type,
        aggregate_id: event.aggregate_id,
        payload: JSON.stringify({ ...event, id }),
        created_at: now,
        processed_at: null,
        retry_count: 0,
        next_retry_at: null,
        error: null,
        claimed_by: null,
        claim_expires_at: null,
      });

      return id;
    },

    async getByIds(ids: string[]) {
      if (ids.length === 0) return [];

      const results = await db
        .select()
        .from(outboxEvents)
        .where(inArray(outboxEvents.id, ids))
        .all();

      return results.map(sqlToOutboxEvent);
    },

    async getUnprocessed(limit: number) {
      const now = new Date().toISOString();

      const results = await db
        .select()
        .from(outboxEvents)
        .where(
          and(
            isNull(outboxEvents.processed_at),
            or(
              isNull(outboxEvents.next_retry_at),
              lte(outboxEvents.next_retry_at, now),
            ),
            or(
              isNull(outboxEvents.claimed_by),
              lte(outboxEvents.claim_expires_at, now),
            ),
          ),
        )
        .orderBy(outboxEvents.created_at, outboxEvents.id)
        .limit(limit)
        .all();

      return results.map(sqlToOutboxEvent);
    },

    async claimEvents(
      ids: string[],
      workerId: string,
      leaseMs: number,
    ): Promise<string[]> {
      if (ids.length === 0) return [];

      const now = new Date().toISOString();
      const claimExpires = new Date(Date.now() + leaseMs).toISOString();

      await db
        .update(outboxEvents)
        .set({
          claimed_by: workerId,
          claim_expires_at: claimExpires,
        })
        .where(
          and(
            inArray(outboxEvents.id, ids),
            isNull(outboxEvents.processed_at),
            or(
              isNull(outboxEvents.claimed_by),
              lte(outboxEvents.claim_expires_at, now),
            ),
          ),
        );

      // Read back to confirm which were claimed
      const claimed = await db
        .select({ id: outboxEvents.id })
        .from(outboxEvents)
        .where(
          and(
            inArray(outboxEvents.id, ids),
            eq(outboxEvents.claimed_by, workerId),
          ),
        )
        .all();

      return claimed.map((r) => r.id);
    },

    async markProcessed(ids: string[]): Promise<void> {
      if (ids.length === 0) return;

      await db
        .update(outboxEvents)
        .set({ processed_at: new Date().toISOString() })
        .where(inArray(outboxEvents.id, ids));
    },

    async markRetry(
      id: string,
      error: string,
      nextRetryAt: string,
    ): Promise<void> {
      await db
        .update(outboxEvents)
        .set({
          error,
          next_retry_at: nextRetryAt,
          retry_count: sql`${outboxEvents.retry_count} + 1`,
          claimed_by: null,
          claim_expires_at: null,
        })
        .where(eq(outboxEvents.id, id));
    },

    async cleanup(olderThan: string): Promise<number> {
      const results = await db
        .delete(outboxEvents)
        .where(
          and(
            sql`${outboxEvents.processed_at} IS NOT NULL`,
            lte(outboxEvents.processed_at, olderThan),
          ),
        )
        .returning();

      return results.length;
    },

    async deadLetter(id: string, finalError: string): Promise<void> {
      const now = new Date().toISOString();
      await db
        .update(outboxEvents)
        .set({
          processed_at: now,
          dead_lettered_at: now,
          final_error: finalError,
        })
        .where(eq(outboxEvents.id, id));
    },

    async listFailed(
      tenantId: string,
      params: ListParams = {},
    ): Promise<ListFailedEventsResponse> {
      const { page = 0, per_page = 50, include_totals = false } = params;

      const rows = await db
        .select()
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.tenant_id, tenantId),
            isNotNull(outboxEvents.dead_lettered_at),
          ),
        )
        .orderBy(desc(outboxEvents.dead_lettered_at), outboxEvents.id)
        .offset(page * per_page)
        .limit(per_page)
        .all();

      const events = rows.map((row) => ({
        ...(parseJsonIfString(row.payload, {}) as Record<string, unknown>),
        id: row.id,
        created_at: row.created_at,
        processed_at: row.processed_at,
        retry_count: row.retry_count,
        next_retry_at: row.next_retry_at,
        error: row.error,
        dead_lettered_at: row.dead_lettered_at,
        final_error: row.final_error,
      })) as ListFailedEventsResponse["events"];

      let length = events.length;
      if (include_totals) {
        const [totals] = await db
          .select({ total: countFn() })
          .from(outboxEvents)
          .where(
            and(
              eq(outboxEvents.tenant_id, tenantId),
              isNotNull(outboxEvents.dead_lettered_at),
            ),
          );
        length = Number(totals?.total ?? events.length);
      }

      return {
        events,
        start: page * per_page,
        limit: per_page,
        length,
      };
    },

    async replay(id: string, tenantId: string): Promise<boolean> {
      const results = await db
        .update(outboxEvents)
        .set({
          processed_at: null,
          dead_lettered_at: null,
          final_error: null,
          retry_count: 0,
          next_retry_at: null,
          error: null,
        })
        .where(
          and(
            eq(outboxEvents.id, id),
            eq(outboxEvents.tenant_id, tenantId),
            isNotNull(outboxEvents.dead_lettered_at),
          ),
        )
        .returning();

      return results.length > 0;
    },
  };
}
