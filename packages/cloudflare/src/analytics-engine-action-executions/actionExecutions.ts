import {
  ActionExecution,
  ActionExecutionInsert,
  ActionExecutionLogs,
  ActionExecutionResult,
  ActionExecutionStatus,
  actionExecutionStatusSchema,
} from "@authhero/adapter-interfaces";
import { AnalyticsEngineActionExecutionsAdapterConfig } from "./types";
import {
  executeAnalyticsEngineQuery,
  escapeSQLString,
  escapeSQLIdentifier,
} from "../analytics-engine-logs/query";

/**
 * Analytics Engine field mapping for action_executions (one row per execution):
 *
 * Blobs (strings, max 1024 bytes each):
 *   blob1: id (execution_id)
 *   blob2: trigger_id
 *   blob3: status
 *   blob4: results (JSON-encoded ActionExecutionResult[])
 *   blob5: logs   (JSON-encoded ActionExecutionLogs)
 *   blob6: created_at (ISO 8601)
 *   blob7: updated_at (ISO 8601)
 *
 * Doubles:
 *   double1: created_at_ts (epoch ms) — sort key.
 *
 * Indexes:
 *   index1: tenant_id (sampling shard / filter key).
 *
 * Captured `logs` may exceed AE's 1024-byte-per-blob ceiling for chatty
 * actions; we truncate and mark with a `[truncated]` sentinel rather than
 * spanning blobs.
 */

const DEFAULT_DATASET = "authhero_action_executions";
const BLOB_MAX_BYTES = 1024;
const TRUNCATED_SENTINEL = "[truncated]";

function tryParseJSON<T>(value: unknown): T | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function parseStatus(value: unknown): ActionExecutionStatus {
  const parsed = actionExecutionStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : "unspecified";
}

function truncate(value: string, max: number = BLOB_MAX_BYTES): string {
  if (value.length <= max) return value;
  // Leave room for the sentinel so consumers can tell the row was truncated.
  const head = value.substring(0, max - TRUNCATED_SENTINEL.length);
  return `${head}${TRUNCATED_SENTINEL}`;
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) return "";
  return JSON.stringify(value);
}

/**
 * Convert an AE SQL row back into an ActionExecution.
 */
export function formatActionExecutionFromStorage(
  row: Record<string, unknown>,
): ActionExecution {
  const createdAtIso =
    typeof row.blob6 === "string" && row.blob6.length > 0
      ? row.blob6
      : typeof row.double1 === "number"
        ? new Date(row.double1).toISOString()
        : "";
  const updatedAtIso =
    typeof row.blob7 === "string" && row.blob7.length > 0
      ? row.blob7
      : createdAtIso;

  return {
    id: typeof row.blob1 === "string" ? row.blob1 : "",
    tenant_id: typeof row.index1 === "string" ? row.index1 : "",
    trigger_id: typeof row.blob2 === "string" ? row.blob2 : "",
    status: parseStatus(row.blob3),
    results: tryParseJSON<ActionExecutionResult[]>(row.blob4) ?? [],
    logs: tryParseJSON<ActionExecutionLogs>(row.blob5),
    created_at: createdAtIso,
    updated_at: updatedAtIso,
  };
}

export function createActionExecution(
  config: AnalyticsEngineActionExecutionsAdapterConfig,
) {
  return async (
    tenant_id: string,
    execution: ActionExecutionInsert,
  ): Promise<ActionExecution> => {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    const stored: ActionExecution = {
      id: execution.id,
      tenant_id,
      trigger_id: execution.trigger_id,
      status: execution.status,
      results: execution.results,
      logs: execution.logs,
      created_at: nowIso,
      updated_at: nowIso,
    };

    writeToAnalyticsEngine(config, tenant_id, stored, now);

    return stored;
  };
}

function writeToAnalyticsEngine(
  config: AnalyticsEngineActionExecutionsAdapterConfig,
  tenantId: string,
  execution: ActionExecution,
  createdAtTs: number,
): void {
  if (!config.analyticsEngineBinding) {
    console.error(
      "Analytics Engine action_executions binding not configured; skipping write",
    );
    return;
  }

  try {
    config.analyticsEngineBinding.writeDataPoint({
      blobs: [
        truncate(execution.id),
        truncate(execution.trigger_id),
        truncate(execution.status),
        truncate(stringify(execution.results)),
        truncate(stringify(execution.logs)),
        truncate(execution.created_at),
        truncate(execution.updated_at),
      ],
      doubles: [createdAtTs],
      // AE caps index values at 96 bytes.
      indexes: [tenantId.substring(0, 96)],
    });
  } catch (error) {
    console.error(
      "Failed to write action_execution to Analytics Engine:",
      error,
    );
  }
}

export function getActionExecution(
  config: AnalyticsEngineActionExecutionsAdapterConfig,
) {
  return async (
    tenant_id: string,
    execution_id: string,
  ): Promise<ActionExecution | null> => {
    const dataset = config.dataset || DEFAULT_DATASET;

    const query = `
      SELECT *
      FROM ${escapeSQLIdentifier(dataset)}
      WHERE index1 = ${escapeSQLString(tenant_id)}
        AND blob1 = ${escapeSQLString(execution_id)}
      LIMIT 1
    `;

    const rows = await executeAnalyticsEngineQuery(config, query);

    if (rows.length === 0 || !rows[0]) {
      return null;
    }

    return formatActionExecutionFromStorage(rows[0]);
  };
}
