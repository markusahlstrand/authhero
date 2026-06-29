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

interface ParsedQuery {
  /** `field:value` clauses, grouped by field (repeated keys collected). */
  fields: Record<string, string[]>;
  /** Bare free-text terms (no `field:` prefix). */
  terms: string[];
}

/**
 * Reverse Lucene escaping on a value operand: a backslash followed by a Lucene
 * reserved character is a literal of that character (e.g. `auth0|abc\-123` ->
 * `auth0|abc-123`). Clients (such as the admin UI) escape filter values per
 * Lucene rules before interpolating them, so without this the backslash leaks
 * into the SQL comparison and exact matches never hit.
 */
function unescapeLuceneValue(value: string): string {
  return value.replace(/\\([\\"+\-!(){}[\]^~*?:/&|])/g, "$1");
}

/** Split a query into tokens, treating double-quoted spans as atomic. */
function tokenizeQuery(q: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < q.length; i++) {
    const char = q[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === " " && !inQuotes) {
      if (current.trim()) tokens.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

/** Strip one layer of surrounding double quotes, then unescape Lucene escapes. */
function cleanValue(raw: string): string {
  let value = raw;
  if (value.startsWith('"') && value.endsWith('"') && value.length > 1) {
    value = value.slice(1, -1);
  }
  return unescapeLuceneValue(value);
}

/**
 * Parse lucene-style filter query (simple implementation).
 * Supports key:value, key:"quoted value", and repeated keys joined with OR
 * (e.g. `user_id:"a" OR user_id:"b"`) which are collected into a list. Tokens
 * without a `field:` prefix are treated as bare free-text search terms.
 */
function parseLuceneFilter(q: string): ParsedQuery {
  const fields: Record<string, string[]> = {};
  const terms: string[] = [];

  for (const token of tokenizeQuery(q)) {
    // `OR`/`AND` are conjunction markers, not values.
    if (token === "OR" || token === "AND") continue;

    const match = token.match(/^(\w+):([\s\S]*)$/);
    if (match) {
      const key = match[1]!;
      const value = cleanValue(match[2]!);
      if (!fields[key]) fields[key] = [];
      fields[key].push(value);
    } else {
      const term = cleanValue(token);
      if (term) terms.push(term);
    }
  }

  return { fields, terms };
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
function buildWhereConditions(filters: Record<string, string[]>): string[] {
  const conditions: string[] = [];

  for (const [key, rawValues] of Object.entries(filters)) {
    const values = rawValues.filter((v) => v !== "");
    if (values.length === 0) continue;

    if (key === "success") {
      const fragments: string[] = [];
      const seen = new Set<string>();
      for (const value of values) {
        if (seen.has(value)) continue;
        seen.add(value);
        if (value === "true") {
          fragments.push(`blob3 LIKE 's%'`);
        } else if (value === "false") {
          fragments.push(`blob3 LIKE 'f%'`);
        }
      }
      if (fragments.length > 0) {
        conditions.push(`(${fragments.join(" OR ")})`);
      }
      continue;
    }

    const blobField = mapFilterKeyToBlob(key);
    if (!blobField) continue;

    if (values.length === 1) {
      conditions.push(`${blobField} = ${escapeSQLString(values[0]!)}`);
    } else {
      const inList = values.map((v) => escapeSQLString(v)).join(", ");
      conditions.push(`${blobField} IN (${inList})`);
    }
  }

  return conditions;
}

/**
 * Build WHERE conditions for bare free-text terms. Each term matches user_id
 * (blob7, exact), or ip (blob5) / description (blob4) as a substring. Searching
 * description matters because a user's email can appear there before login
 * completes — i.e. before any user_id exists to match against.
 */
function buildTermConditions(terms: string[]): string[] {
  return terms
    .filter((term) => term !== "")
    .map((term) => {
      const exact = escapeSQLString(term);
      const like = escapeSQLString(`%${term}%`);
      return `(blob7 = ${exact} OR blob5 LIKE ${like} OR blob4 LIKE ${like})`;
    });
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
    const {
      page = 0,
      per_page = 50,
      include_totals = false,
      sort,
      q,
      from_date,
      to_date,
    } = params;

    const dataset = config.dataset || "authhero_logs";

    // Build WHERE clause
    // Use index1 for efficient tenant filtering
    const whereConditions: string[] = [`index1 = ${escapeSQLString(tenantId)}`];

    if (q) {
      const { fields, terms } = parseLuceneFilter(q);
      whereConditions.push(...buildWhereConditions(fields));
      whereConditions.push(...buildTermConditions(terms));
    }

    // Date range filter (Unix seconds → epoch ms stored in double2)
    if (typeof from_date === "number" && Number.isFinite(from_date)) {
      whereConditions.push(`double2 >= ${Math.floor(from_date) * 1000}`);
    }
    if (typeof to_date === "number" && Number.isFinite(to_date)) {
      whereConditions.push(`double2 <= ${Math.floor(to_date) * 1000}`);
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
