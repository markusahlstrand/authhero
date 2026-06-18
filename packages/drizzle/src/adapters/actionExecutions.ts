import { eq, and } from "drizzle-orm";
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
        results:
          parseJsonIfString<ActionExecutionResult[]>(row.results) ?? [],
        logs: parseJsonIfString<ActionExecutionLogs>(row.logs),
        created_at: new Date(Number(row.created_at_ts)).toISOString(),
        updated_at: new Date(Number(row.updated_at_ts)).toISOString(),
      };
    },
  };
}
