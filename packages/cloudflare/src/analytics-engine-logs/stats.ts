import {
  StatsAdapter,
  StatsListParams,
  DailyStats,
} from "@authhero/adapter-interfaces";
import { AnalyticsEngineLogsAdapterConfig } from "./types";
import { executeAnalyticsEngineQuery, escapeSQLString } from "./query";

// Log types that count as successful logins
const LOGIN_TYPES = [
  "s", // SUCCESS_LOGIN
  "seacft", // SUCCESS_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN
  "seccft", // SUCCESS_EXCHANGE_CLIENT_CREDENTIALS_FOR_ACCESS_TOKEN
  "sepft", // SUCCESS_EXCHANGE_PASSWORD_FOR_ACCESS_TOKEN
  "sertft", // SUCCESS_EXCHANGE_REFRESH_TOKEN_FOR_ACCESS_TOKEN
  "ssa", // SUCCESS_SILENT_AUTH
];

// Log types that indicate leaked password detection
const LEAKED_PASSWORD_TYPES = [
  "pwd_leak",
  "signup_pwd_leak",
  "reset_pwd_leak",
];

/**
 * Parses a date string in YYYYMMDD format to YYYY-MM-DD
 */
function parseYYYYMMDD(dateStr: string): string {
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

/**
 * Gets date string in YYYY-MM-DD format
 */
function toDateString(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

/**
 * Create a stats adapter that queries Analytics Engine
 */
export function createAnalyticsEngineStatsAdapter(
  config: AnalyticsEngineLogsAdapterConfig,
): StatsAdapter {
  const dataset = config.dataset || "authhero_logs";

  return {
    async getDaily(
      tenantId: string,
      params: StatsListParams = {},
    ): Promise<DailyStats[]> {
      const { from, to } = params;

      // Default to last 30 days if no dates provided
      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const fromDate = from ? parseYYYYMMDD(from) : toDateString(thirtyDaysAgo);
      const toDate = to ? parseYYYYMMDD(to) : toDateString(now);

      // Convert to timestamps for comparison with double2 (epoch milliseconds)
      const fromTimestamp = new Date(`${fromDate}T00:00:00Z`).getTime();
      const toTimestamp =
        new Date(`${toDate}T23:59:59.999Z`).getTime();

      // Build IN clause for login types
      const loginTypesIn = LOGIN_TYPES.map((t) => escapeSQLString(t)).join(", ");
      const leakedPasswordTypesIn = LEAKED_PASSWORD_TYPES.map((t) =>
        escapeSQLString(t),
      ).join(", ");

      // Query to aggregate daily stats
      // blob2 = tenant_id, blob3 = type, double2 = timestamp (epoch ms)
      const query = `
        SELECT
          toDate(toDateTime(double2 / 1000)) AS date,
          SUM(CASE WHEN blob3 IN (${loginTypesIn}) THEN 1 ELSE 0 END) AS logins,
          SUM(CASE WHEN blob3 = 'ss' THEN 1 ELSE 0 END) AS signups,
          SUM(CASE WHEN blob3 IN (${leakedPasswordTypesIn}) THEN 1 ELSE 0 END) AS leaked_passwords,
          MIN(double2) AS first_event,
          MAX(double2) AS last_event
        FROM "${dataset}"
        WHERE index1 = ${escapeSQLString(tenantId)}
          AND double2 >= ${fromTimestamp}
          AND double2 <= ${toTimestamp}
        GROUP BY date
        ORDER BY date ASC
      `;

      const rows = await executeAnalyticsEngineQuery(config, query);

      return rows.map((row) => ({
        date: String(row.date),
        logins: Number(row.logins) || 0,
        signups: Number(row.signups) || 0,
        leaked_passwords: Number(row.leaked_passwords) || 0,
        created_at: row.first_event
          ? new Date(Number(row.first_event)).toISOString()
          : new Date().toISOString(),
        updated_at: row.last_event
          ? new Date(Number(row.last_event)).toISOString()
          : new Date().toISOString(),
      }));
    },

    async getActiveUsers(tenantId: string): Promise<number> {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const fromTimestamp = thirtyDaysAgo.getTime();

      // Build IN clause for login types
      const loginTypesIn = LOGIN_TYPES.map((t) => escapeSQLString(t)).join(", ");

      // Count distinct users who have logged in within the last 30 days
      // blob7 = user_id, blob3 = type, double2 = timestamp (epoch ms)
      const query = `
        SELECT COUNT(DISTINCT blob7) AS count
        FROM "${dataset}"
        WHERE index1 = ${escapeSQLString(tenantId)}
          AND double2 >= ${fromTimestamp}
          AND blob3 IN (${loginTypesIn})
          AND blob7 IS NOT NULL
          AND blob7 != ''
      `;

      const rows = await executeAnalyticsEngineQuery(config, query);
      const firstRow = rows[0];

      if (firstRow && firstRow.count !== undefined) {
        return Number(firstRow.count) || 0;
      }

      return 0;
    },
  };
}
