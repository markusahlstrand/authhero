import { eq, and, gte, lt, inArray, sql } from "drizzle-orm";
import {
  AnalyticsAdapter,
  AnalyticsGroupBy,
  AnalyticsQueryParams,
  AnalyticsQueryResponse,
  AnalyticsResource,
} from "@authhero/adapter-interfaces";
import { logs } from "../schema/sqlite";
import type { DrizzleDb } from "./types";

const RESOURCE_EVENTS: Record<AnalyticsResource, readonly string[]> = {
  "active-users": ["s", "seacft"],
  logins: ["s", "f", "fp"],
  signups: ["ss", "fs"],
  "refresh-tokens": ["seacft", "fertft"],
  sessions: ["slo"],
};

const METRIC_BY_RESOURCE: Record<
  AnalyticsResource,
  { alias: string; type: string; agg: "count" | "uniq" }
> = {
  "active-users": { alias: "active_users", type: "UInt64", agg: "uniq" },
  logins: { alias: "logins", type: "UInt64", agg: "count" },
  signups: { alias: "signups", type: "UInt64", agg: "count" },
  "refresh-tokens": { alias: "refresh_tokens", type: "UInt64", agg: "count" },
  sessions: { alias: "sessions", type: "UInt64", agg: "count" },
};

function timeBucket(interval: string) {
  switch (interval) {
    case "hour":
      return sql<string>`substr(${logs.date}, 1, 13)`;
    case "month":
      return sql<string>`substr(${logs.date}, 1, 7)`;
    case "day":
      return sql<string>`substr(${logs.date}, 1, 10)`;
    case "week":
      // ISO week start (Monday). SQLite's strftime("%w") returns 0=Sunday,
      // so subtract (%w + 6) % 7 days from the date to land on Monday.
      return sql<string>`date(substr(${logs.date}, 1, 10), '-' || ((cast(strftime('%w', substr(${logs.date}, 1, 10)) as integer) + 6) % 7) || ' days')`;
    default:
      throw new Error(
        `Unsupported interval '${interval}' for SQL analytics adapter`,
      );
  }
}

function escapeIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function dimensionRef(dim: AnalyticsGroupBy) {
  switch (dim) {
    case "connection":
      return logs.connection;
    case "client_id":
      return logs.client_id;
    case "user_type":
      return logs.strategy_type;
    case "event":
      return logs.type;
    case "time":
      throw new Error("time dimension handled separately");
  }
}

export function createAnalyticsAdapter(db: DrizzleDb): AnalyticsAdapter {
  return {
    async query(
      tenantId: string,
      resource: AnalyticsResource,
      params: AnalyticsQueryParams,
    ): Promise<AnalyticsQueryResponse> {
      const startedAt = Date.now();
      const events = RESOURCE_EVENTS[resource];
      const metric = METRIC_BY_RESOURCE[resource];

      const whereClauses = [
        eq(logs.tenant_id, tenantId),
        gte(logs.date, params.from),
        lt(logs.date, params.to),
        inArray(logs.type, events as unknown as string[]),
      ];

      if (params.filters.connection?.length) {
        whereClauses.push(inArray(logs.connection, params.filters.connection));
      }
      if (params.filters.client_id?.length) {
        whereClauses.push(inArray(logs.client_id, params.filters.client_id));
      }
      if (params.filters.user_type?.length) {
        whereClauses.push(
          inArray(
            logs.strategy_type,
            params.filters.user_type as unknown as string[],
          ),
        );
      }
      if (params.filters.user_id?.length) {
        whereClauses.push(inArray(logs.user_id, params.filters.user_id));
      }

      const selectShape: Record<string, unknown> = {};
      const groupRefs: unknown[] = [];
      const meta: AnalyticsQueryResponse["meta"] = [];

      for (const dim of params.group_by) {
        if (dim === "time") {
          const bucket = timeBucket(params.interval);
          selectShape.time = bucket;
          groupRefs.push(bucket);
          meta.push({
            name: "time",
            type: params.interval === "hour" ? "DateTime" : "Date",
          });
        } else {
          const ref = dimensionRef(dim);
          selectShape[dim] = ref;
          groupRefs.push(ref);
          meta.push({ name: dim, type: "String" });
        }
      }

      selectShape[metric.alias] =
        metric.agg === "uniq"
          ? sql<number>`COUNT(DISTINCT ${logs.user_id})`
          : sql<number>`COUNT(*)`;
      meta.push({ name: metric.alias, type: metric.type });

      let query = db
        .select(selectShape as never)
        .from(logs)
        .where(and(...whereClauses)) as unknown as {
        groupBy: (...args: unknown[]) => typeof query;
        orderBy: (expr: unknown) => typeof query;
        limit: (n: number) => typeof query;
        offset: (n: number) => typeof query;
        all: () => Promise<Array<Record<string, unknown>>>;
      };

      if (groupRefs.length > 0) {
        query = query.groupBy(...groupRefs);
      }

      // ORDER BY — only allow columns that appear in the SELECT list. The
      // route already validates order_by, but defend in depth so a raw call
      // to the adapter can't inject SQL via the identifier.
      const allowedOrderCols = new Set<string>([...Object.keys(selectShape)]);
      if (params.order_by) {
        const desc = params.order_by.startsWith("-");
        const col = desc ? params.order_by.slice(1) : params.order_by;
        if (!allowedOrderCols.has(col)) {
          throw new Error(
            `Invalid order_by column '${col}' for analytics query`,
          );
        }
        const ident = escapeIdentifier(col);
        query = query.orderBy(sql.raw(`${ident} ${desc ? "DESC" : "ASC"}`));
      } else if (params.group_by[0] === "time") {
        query = query.orderBy(sql.raw(`${escapeIdentifier("time")} ASC`));
      } else {
        query = query.orderBy(
          sql.raw(`${escapeIdentifier(metric.alias)} DESC`),
        );
      }

      query = query.limit(params.limit).offset(params.offset);

      const rows = await query.all();

      const data = rows.map((row) => {
        const out: Record<string, unknown> = {};
        for (const m of meta) {
          const raw = row[m.name];
          out[m.name] =
            m.type === "UInt64"
              ? Number(raw) || 0
              : raw === null || raw === undefined
                ? ""
                : raw;
        }
        return out;
      });

      return {
        meta,
        data,
        rows: data.length,
        rows_before_limit_at_least: data.length,
        statistics: { elapsed: (Date.now() - startedAt) / 1000 },
      };
    },
  };
}
