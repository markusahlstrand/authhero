import {
  AnalyticsAdapter,
  AnalyticsQueryParams,
  AnalyticsQueryResponse,
  AnalyticsResource,
  AnalyticsGroupBy,
} from "@authhero/adapter-interfaces";
import { AnalyticsEngineLogsAdapterConfig } from "./types";
import { escapeSQLString, escapeSQLIdentifier } from "./query";

// Event types per resource. These match the log `type` values we already write
// via createLog (blob3).
const RESOURCE_EVENTS: Record<AnalyticsResource, readonly string[]> = {
  "active-users": ["s", "seacft"],
  logins: ["s", "f", "fp"],
  signups: ["ss", "fs"],
  "refresh-tokens": ["seacft", "fertft"],
  // No dedicated session-created event yet; track logouts as the lifecycle signal.
  sessions: ["slo"],
};

// Field → blob mapping (kept in sync with logs.ts)
const BLOB_BY_DIMENSION = {
  connection: "blob9",
  client_id: "blob11",
  user_type: "blob16", // strategy_type
  event: "blob3",
} as const;

const FILTER_BLOB = {
  connection: "blob9",
  client_id: "blob11",
  user_type: "blob16",
  user_id: "blob7",
} as const;

const METRIC_BY_RESOURCE: Record<
  AnalyticsResource,
  { expr: string; alias: string; type: string }
> = {
  "active-users": {
    expr: "uniqExact(blob7)",
    alias: "active_users",
    type: "UInt64",
  },
  logins: { expr: "count()", alias: "logins", type: "UInt64" },
  signups: { expr: "count()", alias: "signups", type: "UInt64" },
  "refresh-tokens": {
    expr: "count()",
    alias: "refresh_tokens",
    type: "UInt64",
  },
  sessions: { expr: "count()", alias: "sessions", type: "UInt64" },
};

function timeBucketExpr(interval: string, tz: string): string {
  // Cloudflare Analytics Engine's toStartOf* functions don't accept a tz arg;
  // apply the timezone by constructing the DateTime in that zone first.
  const ts = `toDateTime(intDiv(double2, 1000), ${escapeSQLString(tz)})`;
  switch (interval) {
    case "hour":
      return `toStartOfHour(${ts})`;
    case "week":
      return `toStartOfWeek(${ts})`;
    case "month":
      return `toStartOfMonth(${ts})`;
    case "day":
    default:
      return `toStartOfDay(${ts})`;
  }
}

function timeColumnType(interval: string): string {
  return interval === "hour" ? "DateTime" : "Date";
}

function buildFilterClause(
  params: AnalyticsQueryParams,
  tenantId: string,
  events: readonly string[],
): string {
  const fromMs = new Date(params.from).getTime();
  const toMs = new Date(params.to).getTime();

  const eventList = events.map((e) => escapeSQLString(e)).join(", ");
  const clauses: string[] = [
    `index1 = ${escapeSQLString(tenantId)}`,
    `double2 >= ${fromMs}`,
    `double2 < ${toMs}`,
    `blob3 IN (${eventList})`,
  ];

  for (const [field, blob] of Object.entries(FILTER_BLOB)) {
    const values = params.filters[field as keyof typeof FILTER_BLOB];
    if (values && values.length > 0) {
      const inList = values.map((v) => escapeSQLString(v)).join(", ");
      clauses.push(`${blob} IN (${inList})`);
    }
  }

  return clauses.join(" AND ");
}

function buildOrderBy(
  params: AnalyticsQueryParams,
  groupColumns: string[],
  metricAlias: string,
): string {
  if (params.order_by) {
    const desc = params.order_by.startsWith("-");
    const col = desc ? params.order_by.slice(1) : params.order_by;
    return `${escapeSQLIdentifier(col)} ${desc ? "DESC" : "ASC"}`;
  }
  if (groupColumns.length > 0) {
    // Sort by time ascending if grouped by time; otherwise descending metric.
    if (groupColumns[0] === "time") {
      return `${escapeSQLIdentifier("time")} ASC`;
    }
    return `${escapeSQLIdentifier(metricAlias)} DESC`;
  }
  return `${escapeSQLIdentifier(metricAlias)} DESC`;
}

interface AnalyticsEngineRawResponse {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  data?: Array<Record<string, unknown>>;
  meta?: Array<{ name: string; type: string }>;
  rows?: number;
  rows_before_limit_at_least?: number;
}

export function createAnalyticsEngineAnalyticsAdapter(
  config: AnalyticsEngineLogsAdapterConfig,
): AnalyticsAdapter {
  const dataset = config.dataset || "authhero_logs";

  return {
    async query(
      tenantId: string,
      resource: AnalyticsResource,
      params: AnalyticsQueryParams,
    ): Promise<AnalyticsQueryResponse> {
      const events = RESOURCE_EVENTS[resource];
      const metric = METRIC_BY_RESOURCE[resource];

      const groupExprs: string[] = [];
      const meta: AnalyticsQueryResponse["meta"] = [];

      for (const dim of params.group_by as AnalyticsGroupBy[]) {
        if (dim === "time") {
          const bucket = timeBucketExpr(params.interval, params.tz);
          groupExprs.push(`${bucket} AS ${escapeSQLIdentifier("time")}`);
          meta.push({ name: "time", type: timeColumnType(params.interval) });
        } else {
          const blob = BLOB_BY_DIMENSION[dim];
          groupExprs.push(`${blob} AS ${escapeSQLIdentifier(dim)}`);
          meta.push({ name: dim, type: "String" });
        }
      }

      meta.push({ name: metric.alias, type: metric.type });

      const selectCols = [
        ...groupExprs,
        `${metric.expr} AS ${escapeSQLIdentifier(metric.alias)}`,
      ];

      const groupByClause = params.group_by.length
        ? `GROUP BY ${params.group_by
            .map((dim) => escapeSQLIdentifier(dim === "time" ? "time" : dim))
            .join(", ")}`
        : "";

      const groupColumns = params.group_by.map((d) =>
        d === "time" ? "time" : d,
      );

      const orderBy = buildOrderBy(params, groupColumns, metric.alias);

      const sql = `
        SELECT ${selectCols.join(", ")}
        FROM ${escapeSQLIdentifier(dataset)}
        WHERE ${buildFilterClause(params, tenantId, events)}
        ${groupByClause}
        ORDER BY ${orderBy}
        LIMIT ${Math.max(0, params.limit)} OFFSET ${Math.max(0, params.offset)}
        FORMAT JSON
      `;

      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/analytics_engine/sql`;
      const timeout = config.timeout || 30000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const startedAt = Date.now();

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain",
            Authorization: `Bearer ${config.apiToken}`,
          },
          body: sql,
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(
            `Analytics Engine query failed: ${response.status} ${response.statusText} - ${text}`,
          );
        }

        const result = (await response.json()) as AnalyticsEngineRawResponse;
        if (result.success === false && result.errors?.length) {
          throw new Error(
            `Analytics Engine error: ${result.errors
              .map((e) => e.message)
              .join(", ")}`,
          );
        }

        const data = result.data ?? [];
        return {
          meta: result.meta ?? meta,
          data,
          rows: result.rows ?? data.length,
          rows_before_limit_at_least:
            result.rows_before_limit_at_least ?? data.length,
          statistics: {
            elapsed: (Date.now() - startedAt) / 1000,
          },
        };
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}
