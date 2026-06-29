import { Kysely, sql, RawBuilder } from "kysely";
import {
  AnalyticsAdapter,
  AnalyticsGroupBy,
  AnalyticsQueryParams,
  AnalyticsQueryResponse,
  AnalyticsResource,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";

// Source events per resource (mirrors the CF AE adapter).
const RESOURCE_EVENTS: Record<AnalyticsResource, readonly string[]> = {
  "active-users": ["s", "seacft"],
  logins: ["s", "f", "fp"],
  signups: ["ss", "fs"],
  "refresh-tokens": ["seacft", "fertft"],
  sessions: ["slo"],
  logouts: ["slo", "flo"],
  "password-changes": ["scp", "fcp", "scpr", "fcpr"],
  mfa: ["gd_auth_succeed", "gd_auth_failed", "gd_auth_rejected"],
  "email-verifications": ["sv", "fv", "svr", "fvr"],
  "codes-sent": ["cls", "cs"],
};

const METRIC_BY_RESOURCE: Record<
  AnalyticsResource,
  { alias: string; type: string; agg: "count" | "uniq" }
> = {
  "active-users": { alias: "active_users", type: "UInt64", agg: "uniq" },
  logins: { alias: "logins", type: "UInt64", agg: "count" },
  signups: { alias: "signups", type: "UInt64", agg: "count" },
  "refresh-tokens": {
    alias: "refresh_tokens",
    type: "UInt64",
    agg: "count",
  },
  sessions: { alias: "sessions", type: "UInt64", agg: "count" },
  logouts: { alias: "logouts", type: "UInt64", agg: "count" },
  "password-changes": {
    alias: "password_changes",
    type: "UInt64",
    agg: "count",
  },
  mfa: { alias: "mfa", type: "UInt64", agg: "count" },
  "email-verifications": {
    alias: "email_verifications",
    type: "UInt64",
    agg: "count",
  },
  "codes-sent": { alias: "codes_sent", type: "UInt64", agg: "count" },
};

type SqlDialect = "mysql" | "sqlite";

async function detectDialect(db: Kysely<Database>): Promise<SqlDialect> {
  try {
    await sql`SELECT @@version_comment`.execute(db);
    return "mysql";
  } catch {
    return "sqlite";
  }
}

// Both SQLite and MySQL have no IANA tz support in the queries we generate;
// convert the requested IANA zone to a fixed ±HH:MM offset computed against
// `referenceDate`. DST changes inside the query window are not honored —
// the ClickHouse path is the accurate one.
function tzToFixedOffset(tz: string, referenceDate: Date): string {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(referenceDate)) parts[p.type] = p.value;
  const hour = parts.hour === "24" ? "00" : parts.hour;
  const localMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMin = Math.round((localMs - referenceDate.getTime()) / 60000);
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function assertFixedOffsetTz(tz: string, referenceDate: Date): void {
  const year = referenceDate.getUTCFullYear();
  const baseOffset = tzToFixedOffset(tz, new Date(Date.UTC(year, 0, 1)));
  for (let month = 1; month < 12; month++) {
    const offset = tzToFixedOffset(tz, new Date(Date.UTC(year, month, 1)));
    if (offset !== baseOffset) {
      throw new Error(
        `Timezone '${tz}' is DST-varying (offset ${baseOffset} in January vs ${offset} in ${MONTH_NAMES[month]}) and cannot be bucketed with a single fixed offset by the SQL analytics adapter. Use a fixed-offset zone (e.g. 'UTC' or '+02:00').`,
      );
    }
  }
}

// Parse "±HH:MM" into signed total minutes.
function offsetToMinutes(offset: string): number {
  const sign = offset.startsWith("-") ? -1 : 1;
  const [hh, mm] = offset.slice(1).split(":");
  return sign * (Number(hh) * 60 + Number(mm));
}

function sqliteTimeBucket(
  interval: string,
  offset: string,
): RawBuilder<string> {
  let shifted: RawBuilder<string>;
  if (offset === "+00:00") {
    shifted = sql<string>`${sql.ref("logs.date")}`;
  } else {
    const minutes = offsetToMinutes(offset);
    const modifier = `${minutes >= 0 ? "+" : "-"}${Math.abs(minutes)} minutes`;
    shifted = sql<string>`datetime(${sql.ref("logs.date")}, ${modifier})`;
  }
  switch (interval) {
    case "hour":
      return sql<string>`substr(${shifted}, 1, 13)`;
    case "month":
      return sql<string>`substr(${shifted}, 1, 7)`;
    case "day":
      return sql<string>`substr(${shifted}, 1, 10)`;
    case "week":
      // ISO week start (Monday). SQLite's strftime("%w") returns 0=Sunday;
      // subtract (%w + 6) % 7 days to land on Monday.
      return sql<string>`date(substr(${shifted}, 1, 10), '-' || ((cast(strftime('%w', substr(${shifted}, 1, 10)) as integer) + 6) % 7) || ' days')`;
    default:
      throw new Error(
        `Unsupported interval '${interval}' for SQL analytics adapter`,
      );
  }
}

function mysqlTimeBucket(interval: string, offset: string): RawBuilder<string> {
  // logs.date is stored as a VARCHAR ISO 8601 string in UTC. For the
  // UTC-offset case we can avoid parsing entirely and just slice the prefix.
  if (offset === "+00:00") {
    switch (interval) {
      case "hour":
        return sql<string>`substring(${sql.ref("logs.date")}, 1, 13)`;
      case "day":
        return sql<string>`substring(${sql.ref("logs.date")}, 1, 10)`;
      case "month":
        return sql<string>`substring(${sql.ref("logs.date")}, 1, 7)`;
      case "week": {
        const day = sql<string>`str_to_date(substring(${sql.ref("logs.date")}, 1, 10), '%Y-%m-%d')`;
        return sql<string>`date_format(date_sub(${day}, interval weekday(${day}) day), '%Y-%m-%d')`;
      }
      default:
        throw new Error(
          `Unsupported interval '${interval}' for SQL analytics adapter`,
        );
    }
  }

  // Non-UTC: parse the ISO prefix, shift by offset minutes, then format.
  const minutes = offsetToMinutes(offset);
  const shifted = sql<Date>`date_add(str_to_date(substring(${sql.ref("logs.date")}, 1, 19), '%Y-%m-%dT%H:%i:%s'), interval ${sql.lit(minutes)} minute)`;
  switch (interval) {
    case "hour":
      return sql<string>`date_format(${shifted}, '%Y-%m-%dT%H')`;
    case "day":
      return sql<string>`date_format(${shifted}, '%Y-%m-%d')`;
    case "month":
      return sql<string>`date_format(${shifted}, '%Y-%m')`;
    case "week":
      return sql<string>`date_format(date_sub(${shifted}, interval weekday(${shifted}) day), '%Y-%m-%d')`;
    default:
      throw new Error(
        `Unsupported interval '${interval}' for SQL analytics adapter`,
      );
  }
}

function timeBucketSql(
  interval: string,
  tz: string,
  referenceDate: Date,
  dialect: SqlDialect,
): RawBuilder<string> {
  assertFixedOffsetTz(tz, referenceDate);
  const offset = tzToFixedOffset(tz, referenceDate);
  return dialect === "mysql"
    ? mysqlTimeBucket(interval, offset)
    : sqliteTimeBucket(interval, offset);
}

function dimensionColumn(dim: AnalyticsGroupBy): string {
  switch (dim) {
    case "connection":
      return "logs.connection";
    case "client_id":
      return "logs.client_id";
    case "user_type":
      return "logs.strategy_type";
    case "event":
      return "logs.type";
    case "time":
      throw new Error("time dimension is handled separately");
  }
}

export function createAnalyticsAdapter(db: Kysely<Database>): AnalyticsAdapter {
  let dialectPromise: Promise<SqlDialect> | null = null;
  const getDialect = () => {
    if (!dialectPromise) dialectPromise = detectDialect(db);
    return dialectPromise;
  };

  return {
    async query(
      tenantId: string,
      resource: AnalyticsResource,
      params: AnalyticsQueryParams,
    ): Promise<AnalyticsQueryResponse> {
      const startedAt = Date.now();
      const events = RESOURCE_EVENTS[resource];
      const metric = METRIC_BY_RESOURCE[resource];
      const dialect = await getDialect();

      const meta: AnalyticsQueryResponse["meta"] = [];
      let qb = db.selectFrom("logs").where("tenant_id", "=", tenantId);

      qb = qb.where("date", ">=", params.from).where("date", "<", params.to);
      // The Database.logs.type column is a tight union of known log types;
      // cast events through `never` to satisfy kysely's literal-typed `in`.
      qb = qb.where("type", "in", events as never);

      if (params.filters.connection?.length) {
        qb = qb.where("connection", "in", params.filters.connection);
      }
      if (params.filters.client_id?.length) {
        qb = qb.where("client_id", "in", params.filters.client_id);
      }
      if (params.filters.user_type?.length) {
        qb = qb.where(
          "strategy_type",
          "in",
          params.filters.user_type as unknown as string[],
        );
      }
      if (params.filters.user_id?.length) {
        qb = qb.where("user_id", "in", params.filters.user_id);
      }

      // Build SELECT and GROUP BY based on group_by dimensions.
      const groupRefs: Array<RawBuilder<string>> = [];
      const selectExprs: Array<{
        alias: string;
        expr: RawBuilder<unknown>;
      }> = [];

      for (const dim of params.group_by) {
        if (dim === "time") {
          const bucket = timeBucketSql(
            params.interval,
            params.tz,
            new Date(params.from),
            dialect,
          );
          selectExprs.push({ alias: "time", expr: bucket });
          groupRefs.push(bucket);
          meta.push({
            name: "time",
            type: params.interval === "hour" ? "DateTime" : "Date",
          });
        } else {
          const col = dimensionColumn(dim);
          selectExprs.push({ alias: dim, expr: sql<string>`${sql.ref(col)}` });
          groupRefs.push(sql<string>`${sql.ref(col)}`);
          meta.push({ name: dim, type: "String" });
        }
      }

      const metricExpr =
        metric.agg === "uniq"
          ? sql<number>`COUNT(DISTINCT ${sql.ref("logs.user_id")})`
          : sql<number>`COUNT(*)`;
      selectExprs.push({ alias: metric.alias, expr: metricExpr });
      meta.push({ name: metric.alias, type: metric.type });

      let selectQb = qb.select(
        selectExprs.map(({ alias, expr }) => expr.as(alias)) as never,
      );

      if (groupRefs.length > 0) {
        selectQb = selectQb.groupBy(groupRefs as never);
      }

      // ORDER BY
      if (params.order_by) {
        const desc = params.order_by.startsWith("-");
        const col = desc ? params.order_by.slice(1) : params.order_by;
        selectQb = selectQb.orderBy(col as never, desc ? "desc" : "asc");
      } else if (params.group_by.length > 0 && params.group_by[0] === "time") {
        selectQb = selectQb.orderBy("time" as never, "asc");
      } else {
        selectQb = selectQb.orderBy(metric.alias as never, "desc");
      }

      selectQb = selectQb.limit(params.limit).offset(params.offset);

      const rows = (await selectQb.execute()) as Array<Record<string, unknown>>;

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
