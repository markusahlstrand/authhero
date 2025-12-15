import { ListParams, Log } from "@authhero/adapter-interfaces";
import { AnalyticsEngineLogsAdapterConfig } from "./types";
import {
  executeAnalyticsEngineQuery,
  escapeSQLString,
  escapeSQLIdentifier,
} from "./query";
import { formatLogFromStorage } from "./logs";

interface ListLogsResponse {
  logs: Log[];
  start: number;
  limit: number;
  length: number;
}

/**
 * Parse lucene-style filter query (simple implementation)
 * Supports: user_id:value, ip:value, type:value, client_id:value
 */
function parseLuceneFilter(q: string): Record<string, string> {
  const filters: Record<string, string> = {};

  const parts = q.match(/(\w+):(\S+)/g) || [];
  parts.forEach((part) => {
    const colonIndex = part.indexOf(":");
    const key = part.substring(0, colonIndex);
    const value = part.substring(colonIndex + 1);
    if (key && value) {
      filters[key] = value;
    }
  });

  return filters;
}

/**
 * Map filter keys to Analytics Engine blob field names
 * Note: date is stored in double2 (timestamp), not a blob
 */
function mapFilterKeyToBlob(key: string): string | null {
  const mapping: Record<string, string> = {
    log_id: "blob1",
    tenant_id: "blob2",
    type: "blob3",
    description: "blob4",
    ip: "blob5",
    user_agent: "blob6",
    user_id: "blob7",
    user_name: "blob8",
    connection: "blob9",
    connection_id: "blob10",
    client_id: "blob11",
    client_name: "blob12",
    audience: "blob13",
    scope: "blob14",
    strategy: "blob15",
    strategy_type: "blob16",
    hostname: "blob17",
  };

  return mapping[key] || null;
}

/**
 * Build WHERE clause conditions from filters
 */
function buildWhereConditions(filters: Record<string, string>): string[] {
  const conditions: string[] = [];

  for (const [key, value] of Object.entries(filters)) {
    const blobField = mapFilterKeyToBlob(key);
    if (blobField && value) {
      conditions.push(`${blobField} = ${escapeSQLString(value)}`);
    }
  }

  return conditions;
}

/**
 * Map sort field to Analytics Engine field name
 */
function mapSortFieldToColumn(field: string): string {
  // For date sorting, use the timestamp double field for efficiency
  if (field === "date") {
    return "double2";
  }

  const blobField = mapFilterKeyToBlob(field);
  if (blobField) {
    return blobField;
  }

  // Default to timestamp if unknown field
  return "timestamp";
}

export function listLogs(config: AnalyticsEngineLogsAdapterConfig) {
  return async (
    tenantId: string,
    params: ListParams = {},
  ): Promise<ListLogsResponse> => {
    const { page = 0, per_page = 50, include_totals = false, sort, q } = params;

    const dataset = config.dataset || "authhero_logs";

    // Build WHERE clause
    // Use index1 for efficient tenant filtering
    const whereConditions: string[] = [`index1 = ${escapeSQLString(tenantId)}`];

    if (q) {
      const filters = parseLuceneFilter(q);
      whereConditions.push(...buildWhereConditions(filters));
    }

    const whereClause = whereConditions.join(" AND ");

    // Build ORDER BY clause
    // Default to timestamp descending (most recent first)
    let orderByClause = "ORDER BY timestamp DESC";
    if (sort && sort.sort_by) {
      const sortColumn = mapSortFieldToColumn(sort.sort_by);
      const sortOrder = sort.sort_order === "asc" ? "ASC" : "DESC";
      orderByClause = `ORDER BY ${sortColumn} ${sortOrder}`;
    }

    // Build LIMIT and OFFSET
    const offset = page * per_page;
    const limitClause = `LIMIT ${per_page} OFFSET ${offset}`;

    // Execute main query
    const query = `
      SELECT *
      FROM ${escapeSQLIdentifier(dataset)}
      WHERE ${whereClause}
      ${orderByClause}
      ${limitClause}
    `;

    const rows = await executeAnalyticsEngineQuery(config, query);
    const logs = rows.map(formatLogFromStorage);

    if (!include_totals) {
      return {
        logs,
        start: 0,
        limit: 0,
        length: 0,
      };
    }

    // Get total count
    const countQuery = `
      SELECT count() as count
      FROM ${escapeSQLIdentifier(dataset)}
      WHERE ${whereClause}
    `;

    try {
      const countRows = await executeAnalyticsEngineQuery(config, countQuery);
      const count = countRows[0]?.count || 0;

      return {
        logs,
        start: offset,
        limit: per_page,
        length: Number(count),
      };
    } catch {
      // If count query fails, return without totals
      return {
        logs,
        start: offset,
        limit: per_page,
        length: logs.length,
      };
    }
  };
}
