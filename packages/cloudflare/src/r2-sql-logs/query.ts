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
    // Note: This uses the Cloudflare SQL API endpoint
    // In a Cloudflare Worker environment, you would use the native SQL binding instead
    // For this adapter, we use the HTTP API
    const response = await fetch(
      `${config.apiBaseUrl || "https://sql.r2.workers.dev"}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.authToken}`,
        },
        body: JSON.stringify({
          warehouse: config.warehouseName,
          query: query,
        }),
        signal: controller.signal,
      },
    );

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
