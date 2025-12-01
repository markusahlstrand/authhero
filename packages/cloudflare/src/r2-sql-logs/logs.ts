import { nanoid } from "nanoid";
import { Log, LogInsert } from "@authhero/adapter-interfaces";
import { R2SQLLogsAdapterConfig } from "./types";
import {
  executeR2SQLQuery,
  escapeSQLString,
  escapeSQLIdentifier,
} from "./query";

/**
 * Convert data from R2 SQL back to Log format
 */
export function formatLogFromStorage(row: Record<string, any>): Log {
  const tryParseJSON = (jsonString?: string): any => {
    if (!jsonString) {
      return "";
    }
    try {
      return JSON.parse(jsonString);
    } catch (e) {
      return jsonString;
    }
  };

  return {
    type: row.type,
    date: row.date,
    description: row.description,
    ip: row.ip,
    user_agent: row.user_agent,
    details: tryParseJSON(row.details),
    isMobile: !!row.isMobile,
    user_id: row.user_id,
    user_name: row.user_name,
    connection: row.connection,
    connection_id: row.connection_id,
    client_id: row.client_id,
    client_name: row.client_name,
    audience: row.audience,
    scope: row.scope,
    strategy: row.strategy,
    strategy_type: row.strategy_type,
    hostname: row.hostname,
    auth0_client: tryParseJSON(row.auth0_client),
    log_id: row.id,
    // Include location_info if any geo fields are present
    location_info:
      row.country_code ||
      row.country_code3 ||
      row.country_name ||
      row.city_name ||
      row.latitude ||
      row.longitude ||
      row.time_zone ||
      row.continent_code
        ? {
            country_code: row.country_code || "",
            country_code3: row.country_code3 || "",
            country_name: row.country_name || "",
            city_name: row.city_name || "",
            latitude: row.latitude || "",
            longitude: row.longitude || "",
            time_zone: row.time_zone || "",
            continent_code: row.continent_code || "",
          }
        : undefined,
  };
}

export function createLog(config: R2SQLLogsAdapterConfig) {
  return async (tenantId: string, log: LogInsert): Promise<Log> => {
    console.log("createLog called with config:", config);

    // Passthrough mode: Use base adapter first
    if (config.baseAdapter) {
      const baseLog = await config.baseAdapter.create(tenantId, log);

      // Also send to Pipeline in the background (don't wait for it)
      if (config.pipelineEndpoint || config.pipelineBinding) {
        sendToPipeline(config, tenantId, baseLog).catch((error) => {
          console.error("Failed to send log to Pipeline:", error);
        });
      }

      return baseLog;
    }

    // Standard mode: Send to Pipeline and return
    const id = log.log_id || nanoid();

    const createdLog: Log = {
      ...log,
      log_id: id,
    };

    await sendToPipeline(config, tenantId, createdLog);

    console.log("Log sent to Pipeline with ID:", id);

    return createdLog;
  };
}

/**
 * Send log data to Cloudflare Pipeline
 * Supports both HTTP endpoint and service binding
 */
async function sendToPipeline(
  config: R2SQLLogsAdapterConfig,
  tenantId: string,
  log: Log,
): Promise<void> {
  // Helper to stringify JSON fields if needed
  const stringifyIfTruthy = (value: any): string | undefined => {
    return value ? JSON.stringify(value) : undefined;
  };

  // Prepare log data for Pipeline ingestion
  const logData = {
    id: log.log_id,
    tenant_id: tenantId,
    type: log.type,
    date: log.date,
    description: log.description?.substring(0, 256),
    ip: log.ip,
    user_agent: log.user_agent,
    details: stringifyIfTruthy(log.details)?.substring(0, 8192),
    isMobile: log.isMobile ? 1 : 0,
    user_id: log.user_id,
    user_name: log.user_name,
    connection: log.connection,
    connection_id: log.connection_id,
    client_id: log.client_id,
    client_name: log.client_name,
    audience: log.audience,
    scope: log.scope,
    strategy: log.strategy,
    strategy_type: log.strategy_type,
    hostname: log.hostname,
    auth0_client: stringifyIfTruthy(log.auth0_client),
    log_id: log.log_id,
    // Geo fields from location_info
    country_code: log.location_info?.country_code,
    country_code3: log.location_info?.country_code3,
    country_name: log.location_info?.country_name,
    city_name: log.location_info?.city_name,
    latitude: log.location_info?.latitude,
    longitude: log.location_info?.longitude,
    time_zone: log.location_info?.time_zone,
    continent_code: log.location_info?.continent_code,
  };

  try {
    // Pipeline binding mode (Workers)
    if (config.pipelineBinding) {
      // Pipeline.send() accepts data directly (no need for fetch)
      await config.pipelineBinding.send(logData);
    }
    // HTTP endpoint mode
    else if (config.pipelineEndpoint) {
      const timeout = config.timeout || 30000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(config.pipelineEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify([logData]), // Pipelines accept array of records
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            `Pipeline ingestion failed: ${response.status} ${response.statusText}`,
          );
        }
      } finally {
        clearTimeout(timeoutId);
      }
    } else {
      throw new Error(
        "Either pipelineEndpoint or pipelineBinding must be configured",
      );
    }
  } catch (error) {
    console.error("Failed to send log to Pipeline:", error);
    throw error;
  }
}

export function getLogs(config: R2SQLLogsAdapterConfig) {
  return async (tenantId: string, logId: string): Promise<Log | null> => {
    // Passthrough mode: Use base adapter
    if (config.baseAdapter) {
      return config.baseAdapter.get(tenantId, logId);
    }

    // Standard mode: Query R2 SQL
    const namespace = config.namespace || "default";
    const tableName = config.tableName || "logs";

    const query = `
      SELECT * FROM ${escapeSQLIdentifier(namespace)}.${escapeSQLIdentifier(tableName)}
      WHERE tenant_id = ${escapeSQLString(tenantId)}
        AND id = ${escapeSQLString(logId)}
      LIMIT 1
    `;

    const rows = await executeR2SQLQuery(config, query);

    if (rows.length === 0) {
      return null;
    }

    const firstRow = rows[0];
    if (!firstRow) {
      return null;
    }

    return formatLogFromStorage(firstRow);
  };
}
