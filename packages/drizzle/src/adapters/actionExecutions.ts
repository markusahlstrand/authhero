import { eq, and, sql } from "drizzle-orm";
import type {
  ActionExecution,
  ActionExecutionInsert,
  ActionExecutionLogs,
  ActionExecutionResult,
  ActionExecutionStatus,
  ActionExecutionsAdapter,
} from "@authhero/adapter-interfaces";
import { actionExecutions } from "../schema/sqlite";
import { parseJsonIfString } from "../helpers/transform";
import type { DrizzleDb } from "./types";

// Rows deleted per statement by cleanup(). Same rationale as the codes
// adapter: bound each statement so the first sweep of a long-uncleaned
// deployment stays within D1's statement/response limits.
const CLEANUP_CHUNK = 500;

export function createActionExecutionsAdapter(
  db: DrizzleDb,
): ActionExecutionsAdapter {
  return {
    async create(
      tenant_id: string,
      execution: ActionExecutionInsert,
    ): Promise<ActionExecution> {
      const now = Date.now();

      await db.insert(actionExecutions).values({
        id: execution.id,
        tenant_id,
        trigger_id: execution.trigger_id,
        status: execution.status,
        results: JSON.stringify(execution.results),
        logs: execution.logs ? JSON.stringify(execution.logs) : null,
        created_at_ts: now,
        updated_at_ts: now,
      });

      return {
        id: execution.id,
        tenant_id,
        trigger_id: execution.trigger_id,
        status: execution.status,
        results: execution.results,
        logs: execution.logs,
        created_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      };
    },

    async get(
      tenant_id: string,
      execution_id: string,
    ): Promise<ActionExecution | null> {
      const row = await db
        .select()
        .from(actionExecutions)
        .where(
          and(
            eq(actionExecutions.tenant_id, tenant_id),
            eq(actionExecutions.id, execution_id),
          ),
        )
        .get();

      if (!row) {
        return null;
      }

      return {
        id: row.id,
        tenant_id: row.tenant_id,
        trigger_id: row.trigger_id,
        status: row.status as ActionExecutionStatus,
        results: parseJsonIfString<ActionExecutionResult[]>(row.results) ?? [],
        logs: parseJsonIfString<ActionExecutionLogs>(row.logs),
        created_at: new Date(Number(row.created_at_ts)).toISOString(),
        updated_at: new Date(Number(row.updated_at_ts)).toISOString(),
      };
    },

    async cleanup(olderThan: string): Promise<number> {
      const cutoff = Date.parse(olderThan);
      if (Number.isNaN(cutoff)) {
        throw new Error(`Invalid olderThan date: ${olderThan}`);
      }

      // Chunked for the same reason as the codes cleanup: the subquery bounds
      // each statement (SQLite has no `DELETE ... LIMIT` unless built with
      // SQLITE_ENABLE_UPDATE_DELETE_LIMIT), and `RETURNING` is capped at
      // CLEANUP_CHUNK rows so counting stays cheap.
      let total = 0;

      for (;;) {
        const deleted = await db
          .delete(actionExecutions)
          .where(
            sql`rowid IN (SELECT rowid FROM ${actionExecutions} WHERE ${actionExecutions.created_at_ts} < ${cutoff} LIMIT ${CLEANUP_CHUNK})`,
          )
          .returning({ id: actionExecutions.id });

        total += deleted.length;

        if (deleted.length < CLEANUP_CHUNK) break;
      }

      return total;
    },
  };
}
