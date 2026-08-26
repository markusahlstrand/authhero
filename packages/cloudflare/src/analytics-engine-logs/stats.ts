import {
  StatsAdapter,
  StatsListParams,
  DailyStats,
} from "@authhero/adapter-interfaces";
import { AnalyticsEngineLogsAdapterConfig } from "./types";
import { executeAnalyticsEngineQuery, escapeSQLString } from "./query";

// Match Auth0: only SUCCESS_LOGIN counts as a login (no token exchanges /
// silent auth), and only pwd_leak counts as a leaked-password detection.
const LOGIN_TYPES = ["s"];
const LEAKED_PASSWORD_TYPES = ["pwd_leak"];

/**
 * Normalize a date string in YYYYMMDD or YYYY-MM-DD format to YYYY-MM-DD.
 *
 * The management API already normalizes `from`/`to` to YYYY-MM-DD before it
 * calls the adapter, so blindly re-slicing as YYYYMMDD turned "2026-07-27"
 * into "2026--0-7-" and every timestamp bound into NaN — which made
 * /stats/daily return an empty result set (rendered as all-zero graphs).
 */
function normalizeDateParam(dateStr: string): string {
  if (/^\d{8}$/.test(dateStr)) {
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  }
  return dateStr;
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

      const fromDate = from
        ? normalizeDateParam(from)
        : toDateString(thirtyDaysAgo);
      const toDate = to ? normalizeDateParam(to) : toDateString(now);

      // Convert to timestamps for comparison with double2 (epoch milliseconds)
      const fromTimestamp = new Date(`${fromDate}T00:00:00Z`).getTime();
      const toTimestamp = new Date(`${toDate}T23:59:59.999Z`).getTime();

      // An unparseable date would otherwise be interpolated into the SQL as
      // `NaN`, which silently yields zero rows. Fail loudly instead.
      if (Number.isNaN(fromTimestamp) || Number.isNaN(toTimestamp)) {
        throw new Error(
          `Invalid stats date range: from='${fromDate}' to='${toDate}'`,
        );
      }

      // Build IN clause for login types
      const loginTypesIn = LOGIN_TYPES.map((t) => escapeSQLString(t)).join(
        ", ",
      );
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
      const loginTypesIn = LOGIN_TYPES.map((t) => escapeSQLString(t)).join(
        ", ",
      );

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
