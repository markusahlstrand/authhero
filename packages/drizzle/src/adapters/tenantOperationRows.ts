import { and, asc, count as countFn, eq, inArray, SQL } from "drizzle-orm";
import type {
  ListTenantOperationRowsParams,
  ListTenantOperationRowsResult,
  TenantOperationRow,
  TenantOperationRowCounts,
  TenantOperationRowInsert,
  TenantOperationRowOutcome,
  TenantOperationRowsAdapter,
} from "@authhero/adapter-interfaces";
import {
  tenantOperationRowInsertSchema,
  tenantOperationRowSchema,
} from "@authhero/adapter-interfaces";
import { tenantOperationRows } from "../schema/control-plane";
import { runAtomic, type SqliteBatchItem } from "./atomic";
import type { DrizzleDb } from "./types";

/**
 * Rows written per INSERT statement. Each row binds 10 columns, and D1 caps
 * the bound parameters of a single statement, so stay well under it —
 * callers stage thousands of items at a time.
 */
const INSERT_CHUNK_SIZE = 50;

/** Update statements sent as one atomic unit by `recordOutcomes`. */
const UPDATE_CHUNK_SIZE = 50;

function parsePayload(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function rowToTenantOperationRow(
  row: typeof tenantOperationRows.$inferSelect,
): TenantOperationRow {
  return tenantOperationRowSchema.parse({
    operation_id: row.operation_id,
    seq: row.seq,
    payload: parsePayload(row.payload),
    status: row.status,
    error_code: row.error_code,
    error_message: row.error_message,
    error_path: row.error_path,
    entity_id: row.entity_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * One conditional UPDATE committing a single item's outcome. The
 * `status = 'pending'` guard is what makes `recordOutcomes` idempotent: a
 * replayed chunk matches no rows for items already committed.
 */
function buildOutcomeUpdate(
  db: DrizzleDb,
  operation_id: string,
  outcome: TenantOperationRowOutcome,
  updated_at: string,
): SqliteBatchItem {
  const statement = db
    .update(tenantOperationRows)
    .set({
      status: outcome.status,
      error_code: outcome.error_code ?? null,
      error_message: outcome.error_message ?? null,
      error_path: outcome.error_path ?? null,
      entity_id: outcome.entity_id ?? null,
      updated_at,
    })
    .where(
      and(
        eq(tenantOperationRows.operation_id, operation_id),
        eq(tenantOperationRows.seq, outcome.seq),
        eq(tenantOperationRows.status, "pending"),
      ),
    );
  // Same narrowing the outbox adapter needs: `DrizzleDb` is declared over
  // both the sync and async drivers, so its builders aren't statically
  // `BatchItem<"sqlite">` even though they are exactly that at runtime.
  return statement as unknown as SqliteBatchItem;
}

export function createTenantOperationRowsAdapter(
  db: DrizzleDb,
): TenantOperationRowsAdapter {
  return {
    async createMany(rows: TenantOperationRowInsert[]): Promise<number> {
      if (rows.length === 0) return 0;

      const now = new Date().toISOString();
      const values = rows.map((row) => {
        const input = tenantOperationRowInsertSchema.parse(row);
        const value: typeof tenantOperationRows.$inferInsert = {
          operation_id: input.operation_id,
          seq: input.seq,
          payload: JSON.stringify(input.payload),
          status: input.status,
          error_code: input.error_code ?? null,
          error_message: input.error_message ?? null,
          error_path: input.error_path ?? null,
          entity_id: input.entity_id ?? null,
          created_at: now,
          updated_at: now,
        };
        return value;
      });

      for (const batch of chunk(values, INSERT_CHUNK_SIZE)) {
        await db.insert(tenantOperationRows).values(batch);
      }

      return values.length;
    },

    async claimPending(
      operation_id: string,
      limit: number,
    ): Promise<TenantOperationRow[]> {
      const rows = await db
        .select()
        .from(tenantOperationRows)
        .where(
          and(
            eq(tenantOperationRows.operation_id, operation_id),
            eq(tenantOperationRows.status, "pending"),
          ),
        )
        .orderBy(asc(tenantOperationRows.seq))
        .limit(limit);

      return rows.map(rowToTenantOperationRow);
    },

    async recordOutcomes(
      operation_id: string,
      outcomes: TenantOperationRowOutcome[],
    ): Promise<number> {
      if (outcomes.length === 0) return 0;

      const now = new Date().toISOString();

      // Only rows still `pending` may be committed. Reading them first gives
      // the caller an accurate count; the same guard is repeated in each
      // UPDATE's WHERE so a replayed chunk can never overwrite a status that
      // was already committed.
      const seqs = outcomes.map((outcome) => outcome.seq);
      const pending = new Set<number>();
      for (const seqChunk of chunk(seqs, UPDATE_CHUNK_SIZE)) {
        const rows = await db
          .select({ seq: tenantOperationRows.seq })
          .from(tenantOperationRows)
          .where(
            and(
              eq(tenantOperationRows.operation_id, operation_id),
              eq(tenantOperationRows.status, "pending"),
              inArray(tenantOperationRows.seq, seqChunk),
            ),
          );
        for (const row of rows) pending.add(row.seq);
      }

      const applicable = outcomes.filter((outcome) => pending.has(outcome.seq));
      if (applicable.length === 0) return 0;

      for (const outcomeChunk of chunk(applicable, UPDATE_CHUNK_SIZE)) {
        const statements: SqliteBatchItem[] = outcomeChunk.map((outcome) =>
          buildOutcomeUpdate(db, operation_id, outcome, now),
        );
        const [first, ...rest] = statements;
        if (!first) continue;
        await runAtomic(db, [first, ...rest]);
      }

      return applicable.length;
    },

    async countByStatus(
      operation_id: string,
    ): Promise<TenantOperationRowCounts> {
      const rows = await db
        .select({
          status: tenantOperationRows.status,
          total: countFn(),
        })
        .from(tenantOperationRows)
        .where(eq(tenantOperationRows.operation_id, operation_id))
        .groupBy(tenantOperationRows.status);

      const counts: TenantOperationRowCounts = {
        total: 0,
        pending: 0,
        inserted: 0,
        updated: 0,
        failed: 0,
        skipped: 0,
      };

      for (const row of rows) {
        counts.total += row.total;
        // `status` is a plain text column, so narrow it rather than trusting
        // the database to only ever hold known values.
        switch (row.status) {
          case "pending":
          case "inserted":
          case "updated":
          case "failed":
          case "skipped":
            counts[row.status] += row.total;
            break;
        }
      }

      return counts;
    },

    async list(
      operation_id: string,
      params: ListTenantOperationRowsParams = {},
    ): Promise<ListTenantOperationRowsResult> {
      const page = params.page ?? 0;
      const per_page = params.per_page ?? 50;

      const conditions: SQL[] = [
        eq(tenantOperationRows.operation_id, operation_id),
      ];
      if (params.status !== undefined) {
        const statuses = Array.isArray(params.status)
          ? params.status
          : [params.status];
        conditions.push(inArray(tenantOperationRows.status, statuses));
      }

      const rows = await db
        .select()
        .from(tenantOperationRows)
        .where(and(...conditions))
        .orderBy(asc(tenantOperationRows.seq))
        .offset(page * per_page)
        .limit(per_page);

      return {
        rows: rows.map(rowToTenantOperationRow),
        start: page * per_page,
        limit: per_page,
        length: rows.length,
      };
    },

    async removeByOperation(operation_id: string): Promise<number> {
      const existing = await db
        .select({ seq: tenantOperationRows.seq })
        .from(tenantOperationRows)
        .where(eq(tenantOperationRows.operation_id, operation_id));
      if (existing.length === 0) return 0;

      await db
        .delete(tenantOperationRows)
        .where(eq(tenantOperationRows.operation_id, operation_id));

      return existing.length;
    },
  };
}
