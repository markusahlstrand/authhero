import { AnalyticsEngineLogsAdapterConfig } from "./types";

interface AnalyticsEngineQueryResponse {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  messages?: Array<{ code: number; message: string }>;
  data?: Record<string, any>[];
  meta?: {
    name: string;
    type: string;
  }[];
  rows?: number;
  rows_before_limit_at_least?: number;
}

/**
 * Execute a SQL query against Analytics Engine
 */
export async function executeAnalyticsEngineQuery(
  config: AnalyticsEngineLogsAdapterConfig,
  query: string,
): Promise<Record<string, any>[]> {
  const timeout = config.timeout || 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Construct the Cloudflare Analytics Engine SQL API endpoint
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/analytics_engine/sql`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        Authorization: `Bearer ${config.apiToken}`,
      },
      body: query,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Analytics Engine query failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const result: AnalyticsEngineQueryResponse = await response.json();

    if (!result.success && result.errors && result.errors.length > 0) {
      throw new Error(
        `Analytics Engine error: ${result.errors.map((e) => e.message).join(", ")}`,
      );
    }

    return result.data || [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Escape a string value for SQL
 */
export function escapeSQLString(value: string): string {
  return `'${value.replace(/'/g, "''").replace(/\\/g, "\\\\")}'`;
}

/**
 * Escape an identifier (table name, column name) for SQL
 * Analytics Engine uses double quotes for identifiers
 */
export function escapeSQLIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}
