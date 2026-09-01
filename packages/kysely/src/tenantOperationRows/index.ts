import { Kysely } from "kysely";
import {
  ListTenantOperationRowsParams,
  ListTenantOperationRowsResult,
  TenantOperationRow,
  TenantOperationRowCounts,
  TenantOperationRowInsert,
  TenantOperationRowOutcome,
  TenantOperationRowsAdapter,
  tenantOperationRowInsertSchema,
  tenantOperationRowSchema,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";

type TenantOperationRowRecord = Database["tenant_operation_rows"];

/**
 * Rows are staged thousands at a time, so inserts are chunked. 50 rows x 10
 * columns = 500 bound parameters per statement, comfortably under both
 * SQLite's default 999 limit and MySQL's packet budget.
 */
const INSERT_CHUNK_SIZE = 50;

function parsePayload(raw: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(raw);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return Object.fromEntries(Object.entries(parsed));
  }
  return {};
}

function recordToRow(record: TenantOperationRowRecord): TenantOperationRow {
  return tenantOperationRowSchema.parse({
    operation_id: record.operation_id,
    seq: record.seq,
    payload: parsePayload(record.payload),
    status: record.status,
    error_code: record.error_code,
    error_message: record.error_message,
    error_path: record.error_path,
    entity_id: record.entity_id,
    created_at: record.created_at,
    updated_at: record.updated_at,
  });
}

export function createTenantOperationRowsAdapter(
  db: Kysely<Database>,
): TenantOperationRowsAdapter {
  return {
    async createMany(rows: TenantOperationRowInsert[]): Promise<number> {
      if (rows.length === 0) return 0;

      const now = new Date().toISOString();
      const records: TenantOperationRowRecord[] = rows.map((row) => {
        const input = tenantOperationRowInsertSchema.parse(row);
        return {
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
      });

      for (let i = 0; i < records.length; i += INSERT_CHUNK_SIZE) {
        await db
          .insertInto("tenant_operation_rows")
          .values(records.slice(i, i + INSERT_CHUNK_SIZE))
          .execute();
      }

      return records.length;
    },

    async claimPending(
      operation_id: string,
      limit: number,
    ): Promise<TenantOperationRow[]> {
      const records = await db
        .selectFrom("tenant_operation_rows")
        .where("operation_id", "=", operation_id)
        .where("status", "=", "pending")
        .selectAll()
        .orderBy("seq", "asc")
        .limit(limit)
        .execute();

      return records.map(recordToRow);
    },

    async recordOutcomes(
      operation_id: string,
      outcomes: TenantOperationRowOutcome[],
    ): Promise<number> {
      const now = new Date().toISOString();
      let updated = 0;

      for (const outcome of outcomes) {
        const result = await db
          .updateTable("tenant_operation_rows")
          .where("operation_id", "=", operation_id)
          .where("seq", "=", outcome.seq)
          // Only pending rows move. A replayed chunk therefore cannot
          // overwrite an outcome that was already committed.
          .where("status", "=", "pending")
          .set({
            status: outcome.status,
            error_code: outcome.error_code ?? null,
            error_message: outcome.error_message ?? null,
            error_path: outcome.error_path ?? null,
            entity_id: outcome.entity_id ?? null,
            updated_at: now,
          })
          .executeTakeFirst();

        updated += Number(result.numUpdatedRows);
      }

      return updated;
    },

    async countByStatus(
      operation_id: string,
    ): Promise<TenantOperationRowCounts> {
      const grouped = await db
        .selectFrom("tenant_operation_rows")
        .where("operation_id", "=", operation_id)
        .select(({ fn }) => ["status", fn.count<number>("seq").as("count")])
        .groupBy("status")
        .execute();

      const counts: TenantOperationRowCounts = {
        total: 0,
        pending: 0,
        inserted: 0,
        updated: 0,
        failed: 0,
        skipped: 0,
      };

      for (const group of grouped) {
        const count = Number(group.count);
        counts.total += count;
        switch (group.status) {
          case "pending":
          case "inserted":
          case "updated":
          case "failed":
          case "skipped":
            counts[group.status] += count;
            break;
          default:
            // Unknown status: still counted in `total`, nowhere else.
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
      const per_page = params.per_page ?? 100;

      let query = db
        .selectFrom("tenant_operation_rows")
        .where("operation_id", "=", operation_id);

      if (params.status !== undefined) {
        const statuses = Array.isArray(params.status)
          ? params.status
          : [params.status];
        query = query.where("status", "in", statuses);
      }

      const records = await query
        .selectAll()
        .orderBy("seq", "asc")
        .offset(page * per_page)
        .limit(per_page)
        .execute();

      return {
        rows: records.map(recordToRow),
        start: page * per_page,
        limit: per_page,
        length: records.length,
      };
    },

    async removeByOperation(operation_id: string): Promise<number> {
      const result = await db
        .deleteFrom("tenant_operation_rows")
        .where("operation_id", "=", operation_id)
        .executeTakeFirst();

      return Number(result.numDeletedRows);
    },
  };
}
