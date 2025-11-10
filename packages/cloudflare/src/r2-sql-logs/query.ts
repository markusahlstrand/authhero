import { R2SQLLogsAdapterConfig } from "./types";

interface R2SQLQueryResponse {
  success: boolean;
  errors?: string[];
  data?: Record<string, any>[];
  result?: {
    data: Record<string, any>[];
  };
}

/**
 * Execute a SQL query against R2 SQL
 */
export async function executeR2SQLQuery(
  config: R2SQLLogsAdapterConfig,
  query: string,
): Promise<Record<string, any>[]> {
  const timeout = config.timeout || 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Construct the official Cloudflare R2 SQL API endpoint
    // Format: https://api.sql.cloudflarestorage.com/api/v1/accounts/{ACCOUNT_ID}/r2-sql/query/{WAREHOUSE}
    const endpoint = `https://api.sql.cloudflarestorage.com/api/v1/accounts/${config.accountId}/r2-sql/query/${config.warehouseName}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.authToken}`,
      },
      // Request body should be shaped as { "query": "..." }
      body: JSON.stringify({
        query: query,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `R2 SQL query failed: ${response.status} ${response.statusText}`,
      );
    }

    const result: R2SQLQueryResponse = await response.json();

    if (!result.success && result.errors) {
      throw new Error(`R2 SQL error: ${result.errors.join(", ")}`);
    }

    return result.data || result.result?.data || [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Escape a string value for SQL
 */
export function escapeSQLString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Escape an identifier (table name, column name) for SQL
 */
export function escapeSQLIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}
