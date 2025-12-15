import { nanoid } from "nanoid";
import { Log, LogInsert } from "@authhero/adapter-interfaces";
import { AnalyticsEngineLogsAdapterConfig } from "./types";
import {
  executeAnalyticsEngineQuery,
  escapeSQLString,
  escapeSQLIdentifier,
} from "./query";

/**
 * Analytics Engine field mapping (20 blobs max, 20 doubles max, 1 index):
 *
 * Blobs (strings, max 1024 bytes each):
 *   blob1:  log_id
 *   blob2:  tenant_id
 *   blob3:  type
 *   blob4:  description
 *   blob5:  ip
 *   blob6:  user_agent
 *   blob7:  user_id
 *   blob8:  user_name
 *   blob9:  connection
 *   blob10: connection_id
 *   blob11: client_id
 *   blob12: client_name
 *   blob13: audience
 *   blob14: scope
 *   blob15: strategy
 *   blob16: strategy_type
 *   blob17: hostname
 *   blob18: details (JSON)
 *   blob19: auth0_client (JSON)
 *   blob20: location_info (JSON)
 *
 * Doubles (numbers):
 *   double1: isMobile (0 or 1)
 *   double2: timestamp (epoch ms) - use for time-based sorting
 *
 * Indexes (optimized for filtering):
 *   index1: tenant_id
 *
 * Note: Analytics Engine auto-adds a `timestamp` field for write time.
 *       We store epoch ms in double2 for the log's actual date.
 */

/**
 * Convert data from Analytics Engine back to Log format
 */
export function formatLogFromStorage(row: Record<string, unknown>): Log {
  const tryParseJSON = <T>(jsonString?: string): T | undefined => {
    if (!jsonString) {
      return undefined;
    }
    try {
      return JSON.parse(jsonString) as T;
    } catch {
      return undefined;
    }
  };

  // Use double2 (our stored timestamp) for the date, fallback to AE's auto timestamp
  const timestamp = (row.double2 as number) || (row.timestamp as number);
  const date = timestamp ? new Date(timestamp).toISOString() : "";

  return {
    log_id: row.blob1 as string,
    type: row.blob3 as Log["type"],
    date,
    description: row.blob4 as string,
    ip: row.blob5 as string,
    user_agent: row.blob6 as string,
    user_id: row.blob7 as string,
    user_name: row.blob8 as string,
    connection: row.blob9 as string,
    connection_id: row.blob10 as string,
    client_id: row.blob11 as string,
    client_name: row.blob12 as string,
    audience: row.blob13 as string,
    scope: row.blob14 as string,
    strategy: row.blob15 as string,
    strategy_type: row.blob16 as string,
    hostname: row.blob17 as string,
    details: tryParseJSON(row.blob18 as string),
    auth0_client: tryParseJSON<Log["auth0_client"]>(row.blob19 as string),
    location_info: tryParseJSON<Log["location_info"]>(row.blob20 as string),
    isMobile: row.double1 === 1,
  };
}

export function createLog(config: AnalyticsEngineLogsAdapterConfig) {
  return async (tenantId: string, log: LogInsert): Promise<Log> => {
    const id = log.log_id || nanoid();

    const createdLog: Log = {
      ...log,
      log_id: id,
    };

    writeToAnalyticsEngine(config, tenantId, createdLog);

    return createdLog;
  };
}

/**
 * Write log data to Analytics Engine (fire-and-forget)
 */
function writeToAnalyticsEngine(
  config: AnalyticsEngineLogsAdapterConfig,
  tenantId: string,
  log: Log,
): void {
  if (!config.analyticsEngineBinding) {
    console.error("Analytics Engine binding not configured");
    return;
  }

  const stringify = (value: unknown): string => {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  };

  const truncate = (value: string, max = 1024): string =>
    value.substring(0, max);

  try {
    config.analyticsEngineBinding.writeDataPoint({
      blobs: [
        truncate(log.log_id), // blob1: log_id
        truncate(tenantId), // blob2: tenant_id
        truncate(log.type || ""), // blob3: type
        truncate(log.description || ""), // blob4: description
        truncate(log.ip || ""), // blob5: ip
        truncate(log.user_agent || ""), // blob6: user_agent
        truncate(log.user_id || ""), // blob7: user_id
        truncate(log.user_name || ""), // blob8: user_name
        truncate(log.connection || ""), // blob9: connection
        truncate(log.connection_id || ""), // blob10: connection_id
        truncate(log.client_id || ""), // blob11: client_id
        truncate(log.client_name || ""), // blob12: client_name
        truncate(log.audience || ""), // blob13: audience
        truncate(log.scope || ""), // blob14: scope
        truncate(log.strategy || ""), // blob15: strategy
        truncate(log.strategy_type || ""), // blob16: strategy_type
        truncate(log.hostname || ""), // blob17: hostname
        truncate(stringify(log.details)), // blob18: details (JSON)
        truncate(stringify(log.auth0_client)), // blob19: auth0_client (JSON)
        truncate(stringify(log.location_info)), // blob20: location_info (JSON)
      ],
      doubles: [
        log.isMobile ? 1 : 0, // double1: isMobile
        new Date(log.date).getTime(), // double2: timestamp for sorting
      ],
      indexes: [tenantId.substring(0, 96)], // index1: tenant_id
    });
  } catch (error) {
    console.error("Failed to write log to Analytics Engine:", error);
  }
}

export function getLogs(config: AnalyticsEngineLogsAdapterConfig) {
  return async (tenantId: string, logId: string): Promise<Log | null> => {
    const dataset = config.dataset || "authhero_logs";

    const query = `
      SELECT *
      FROM ${escapeSQLIdentifier(dataset)}
      WHERE index1 = ${escapeSQLString(tenantId)}
        AND blob1 = ${escapeSQLString(logId)}
      LIMIT 1
    `;

    const rows = await executeAnalyticsEngineQuery(config, query);

    if (rows.length === 0 || !rows[0]) {
      return null;
    }

    return formatLogFromStorage(rows[0]);
  };
}
