import { ListParams } from "@authhero/adapter-interfaces";
import { Log } from "@authhero/adapter-interfaces";
import { R2SQLLogsAdapterConfig } from "./types";
import {
  executeR2SQLQuery,
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
 * Supports: user_id:value, ip:value, type:value
 */
function parseLuceneFilter(q: string): Record<string, string> {
  const filters: Record<string, string> = {};

  const parts = q.match(/(\w+):(\S+)/g) || [];
  parts.forEach((part) => {
    const [key, value] = part.split(":");
    if (key && value) {
      filters[key] = value;
    }
  });

  return filters;
}

/**
 * Build WHERE clause conditions from filters
 */
function buildWhereConditions(filters: Record<string, string>): string[] {
  const conditions: string[] = [];

  for (const [key, value] of Object.entries(filters)) {
    const sanitizedKey = key.replace(/[^a-zA-Z0-9_]/g, "");

    // escapeSQLString properly handles SQL injection prevention,
    // so we don't need aggressive value sanitization
    if (sanitizedKey && value) {
      conditions.push(
        `${escapeSQLIdentifier(sanitizedKey)} = ${escapeSQLString(value)}`,
      );
    }
  }

  return conditions;
}

export function listLogs(config: R2SQLLogsAdapterConfig) {
  return async (
    tenantId: string,
    params: ListParams = {},
  ): Promise<ListLogsResponse> => {
    // Passthrough mode: Use base adapter
    if (config.baseAdapter) {
      return config.baseAdapter.list(tenantId, params);
    }

    // Standard mode: Query R2 SQL
    const { page = 0, per_page = 50, include_totals = false, sort, q } = params;

    const namespace = config.namespace || "default";
    const tableName = config.tableName || "logs";

    // Build WHERE clause
    const whereConditions: string[] = [
      `tenant_id = ${escapeSQLString(tenantId)}`,
    ];

    if (q) {
      const filters = parseLuceneFilter(q);
      whereConditions.push(...buildWhereConditions(filters));
    }

    const whereClause = whereConditions.join(" AND ");

    // Build ORDER BY clause
    let orderByClause = "ORDER BY date DESC";
    if (sort && sort.sort_by) {
      const sanitizedSortBy = sort.sort_by.replace(/[^a-zA-Z0-9_]/g, "");
      const sortOrder = sort.sort_order === "asc" ? "ASC" : "DESC";
      orderByClause = `ORDER BY ${escapeSQLIdentifier(sanitizedSortBy)} ${sortOrder}`;
    }

    // Build LIMIT and OFFSET
    const offset = page * per_page;
    const limitClause = `LIMIT ${per_page} OFFSET ${offset}`;

    // Execute main query
    const query = `
      SELECT * FROM ${escapeSQLIdentifier(namespace)}.${escapeSQLIdentifier(tableName)}
      WHERE ${whereClause}
      ${orderByClause}
      ${limitClause}
    `;

    const rows = await executeR2SQLQuery(config, query);
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
      SELECT COUNT(*) as count FROM ${escapeSQLIdentifier(namespace)}.${escapeSQLIdentifier(tableName)}
      WHERE ${whereClause}
    `;

    const countRows = await executeR2SQLQuery(config, countQuery);
    const count = countRows[0]?.count || 0;

    return {
      logs,
      start: offset,
      limit: per_page,
      length: Number(count),
    };
  };
}
