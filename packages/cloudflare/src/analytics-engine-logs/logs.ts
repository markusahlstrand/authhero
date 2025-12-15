import { nanoid } from "nanoid";
import { Log, LogInsert } from "@authhero/adapter-interfaces";
import { AnalyticsEngineLogsAdapterConfig } from "./types";
import { executeAnalyticsEngineQuery, escapeSQLString } from "./query";

/**
 * Analytics Engine blob field mapping:
 * blob1: log_id (indexed)
 * blob2: tenant_id (indexed)
 * blob3: type
 * blob4: description
 * blob5: ip
 * blob6: user_agent
 * blob7: user_id
 * blob8: user_name
 * blob9: connection
 * blob10: connection_id
 * blob11: client_id
 * blob12: client_name
 * blob13: audience
 * blob14: scope
 * blob15: strategy
 * blob16: strategy_type
 * blob17: hostname
 * blob18: details (JSON stringified)
 * blob19: auth0_client (JSON stringified)
 * blob20: location_info (JSON stringified)
 *
 * Analytics Engine double field mapping:
 * double1: isMobile (0 or 1)
 * double2: timestamp (epoch milliseconds for easier time queries)
 *
 * Analytics Engine index field mapping:
 * index1: tenant_id (for efficient filtering)
 */

/**
 * Convert data from Analytics Engine back to Log format
 */
export function formatLogFromStorage(row: Record<string, any>): Log {
  const tryParseJSON = (jsonString?: string): any => {
    if (!jsonString) {
      return undefined;
    }
    try {
      return JSON.parse(jsonString);
    } catch {
      return jsonString;
    }
  };

  // Analytics Engine returns blobs as blob1, blob2, etc.
  return {
    log_id: row.blob1,
    type: row.blob3,
    // Analytics Engine stores timestamp automatically, but we also store the ISO string
    date: row.blob4 || new Date(row.timestamp).toISOString(),
    description: row.blob5,
    ip: row.blob6,
    user_agent: row.blob7,
    user_id: row.blob8,
    user_name: row.blob9,
    connection: row.blob10,
    connection_id: row.blob11,
    client_id: row.blob12,
    client_name: row.blob13,
    audience: row.blob14,
    scope: row.blob15,
    strategy: row.blob16,
    strategy_type: row.blob17,
    hostname: row.blob18,
    details: tryParseJSON(row.blob19),
    auth0_client: tryParseJSON(row.blob20),
    isMobile: row.double1 === 1,
    location_info: tryParseJSON(row.blob21),
  };
}

export function createLog(config: AnalyticsEngineLogsAdapterConfig) {
  return async (tenantId: string, log: LogInsert): Promise<Log> => {
    // Passthrough mode: Use base adapter first
    if (config.baseAdapter) {
      const baseLog = await config.baseAdapter.create(tenantId, log);

      // Also write to Analytics Engine (fire and forget)
      if (config.analyticsEngineBinding) {
        writeToAnalyticsEngine(config, tenantId, baseLog);
      }

      return baseLog;
    }

    // Standard mode: Write to Analytics Engine
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
 * Write log data to Analytics Engine
 * Uses the writeDataPoint method which is fire-and-forget
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

  const stringifyIfTruthy = (value: any): string => {
    if (value === undefined || value === null) {
      return "";
    }
    if (typeof value === "string") {
      return value;
    }
    return JSON.stringify(value);
  };

  try {
    // Write data point to Analytics Engine
    // Blobs: max 20 fields, each up to 1024 bytes (we truncate as needed)
    // Doubles: max 20 numeric fields
    // Indexes: max 1 field, up to 96 bytes (used for efficient filtering)
    config.analyticsEngineBinding.writeDataPoint({
      blobs: [
        log.log_id.substring(0, 1024), // blob1: log_id
        tenantId.substring(0, 1024), // blob2: tenant_id
        (log.type || "").substring(0, 1024), // blob3: type
        (log.date || "").substring(0, 1024), // blob4: date (ISO string)
        (log.description || "").substring(0, 1024), // blob5: description
        (log.ip || "").substring(0, 1024), // blob6: ip
        (log.user_agent || "").substring(0, 1024), // blob7: user_agent
        (log.user_id || "").substring(0, 1024), // blob8: user_id
        (log.user_name || "").substring(0, 1024), // blob9: user_name
        (log.connection || "").substring(0, 1024), // blob10: connection
        (log.connection_id || "").substring(0, 1024), // blob11: connection_id
        (log.client_id || "").substring(0, 1024), // blob12: client_id
        (log.client_name || "").substring(0, 1024), // blob13: client_name
        (log.audience || "").substring(0, 1024), // blob14: audience
        (log.scope || "").substring(0, 1024), // blob15: scope
        (log.strategy || "").substring(0, 1024), // blob16: strategy
        (log.strategy_type || "").substring(0, 1024), // blob17: strategy_type
        (log.hostname || "").substring(0, 1024), // blob18: hostname
        stringifyIfTruthy(log.details).substring(0, 1024), // blob19: details
        stringifyIfTruthy(log.auth0_client).substring(0, 1024), // blob20: auth0_client
      ],
      doubles: [
        log.isMobile ? 1 : 0, // double1: isMobile
        new Date(log.date).getTime(), // double2: timestamp in ms
      ],
      indexes: [tenantId.substring(0, 96)], // index1: tenant_id for filtering
    });
  } catch (error) {
    console.error("Failed to write log to Analytics Engine:", error);
  }
}

export function getLogs(config: AnalyticsEngineLogsAdapterConfig) {
  return async (tenantId: string, logId: string): Promise<Log | null> => {
    // Passthrough mode: Use base adapter
    if (config.baseAdapter) {
      return config.baseAdapter.get(tenantId, logId);
    }

    // Standard mode: Query Analytics Engine
    const dataset = config.dataset || "authhero_logs";

    const query = `
      SELECT *
      FROM ${escapeSQLString(dataset).replace(/'/g, "")}
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
