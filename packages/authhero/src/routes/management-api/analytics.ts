import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  AnalyticsFilters,
  AnalyticsGroupBy,
  AnalyticsInterval,
  AnalyticsQueryParams,
  AnalyticsResource,
  AnalyticsUserType,
  analyticsQueryResponseSchema,
  CacheAdapter,
} from "@authhero/adapter-interfaces";

// Per-resource grouping rules. `time` is always allowed.
const VALID_GROUP_BY: Record<AnalyticsResource, AnalyticsGroupBy[]> = {
  "active-users": ["time", "connection", "client_id", "user_type"],
  logins: ["time", "connection", "client_id", "user_type", "event"],
  signups: ["time", "connection", "client_id", "user_type", "event"],
  "refresh-tokens": ["time", "client_id", "event"],
  sessions: ["time", "client_id"],
  logouts: ["time", "connection", "client_id", "user_type", "event"],
  "password-changes": ["time", "connection", "client_id", "user_type", "event"],
  mfa: ["time", "connection", "client_id", "user_type", "event"],
  "email-verifications": [
    "time",
    "connection",
    "client_id",
    "user_type",
    "event",
  ],
  "codes-sent": ["time", "connection", "client_id", "user_type", "event"],
};

const VALID_INTERVALS: AnalyticsInterval[] = ["hour", "day", "week", "month"];
const VALID_USER_TYPES: AnalyticsUserType[] = [
  "password",
  "social",
  "passwordless",
  "enterprise",
];

const METRIC_BY_RESOURCE: Record<AnalyticsResource, string> = {
  "active-users": "active_users",
  logins: "logins",
  signups: "signups",
  "refresh-tokens": "refresh_tokens",
  sessions: "sessions",
  logouts: "logouts",
  "password-changes": "password_changes",
  mfa: "mfa",
  "email-verifications": "email_verifications",
  "codes-sent": "codes_sent",
};

const MAX_LIMIT = 10000;
const DEFAULT_LIMIT = 1000;
const MAX_ROWS_UNGROUPED = 50000;

// Hour buckets get expensive past a month, and the result set explodes —
// reject up front rather than silently truncate.
const MAX_HOURLY_RANGE_MS = 30 * 24 * 60 * 60 * 1000;

class AnalyticsRequestError extends Error {
  constructor(
    public param: string,
    public detail: string,
  ) {
    super(detail);
  }
}

function parseIsoDate(value: string, param: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AnalyticsRequestError(
      param,
      `'${param}' must be an ISO 8601 datetime`,
    );
  }
  return d.toISOString();
}

function parseInteger(
  value: string | undefined,
  param: string,
  fallback: number,
  { min, max }: { min: number; max: number },
): number {
  if (value === undefined) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || String(n) !== value) {
    throw new AnalyticsRequestError(param, `'${param}' must be an integer`);
  }
  if (n < min || n > max) {
    throw new AnalyticsRequestError(
      param,
      `'${param}' must be between ${min} and ${max}`,
    );
  }
  return n;
}

function parseQueryParams(
  resource: AnalyticsResource,
  rawSingle: (k: string) => string | undefined,
  rawMulti: (k: string) => string[],
): AnalyticsQueryParams {
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const fromRaw = rawSingle("from");
  const toRaw = rawSingle("to");
  const from = fromRaw
    ? parseIsoDate(fromRaw, "from")
    : defaultFrom.toISOString();
  const to = toRaw ? parseIsoDate(toRaw, "to") : now.toISOString();

  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (toMs <= fromMs) {
    throw new AnalyticsRequestError("to", "'to' must be after 'from'");
  }

  const intervalRaw = rawSingle("interval");
  let interval: AnalyticsInterval = "day";
  if (intervalRaw) {
    if (!(VALID_INTERVALS as string[]).includes(intervalRaw)) {
      throw new AnalyticsRequestError(
        "interval",
        `'interval' must be one of: ${VALID_INTERVALS.join(", ")}`,
      );
    }
    interval = intervalRaw as AnalyticsInterval;
  }

  if (interval === "hour" && toMs - fromMs > MAX_HOURLY_RANGE_MS) {
    throw new AnalyticsRequestError(
      "interval",
      "interval=hour is only allowed for ranges of 30 days or less",
    );
  }

  const tz = rawSingle("tz") || "UTC";

  // group_by: comma-separated per the wire format
  const groupByRaw = rawSingle("group_by") || "";
  const groupBy = groupByRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as AnalyticsGroupBy[];

  const allowed = new Set(VALID_GROUP_BY[resource]);
  for (const dim of groupBy) {
    if (!allowed.has(dim)) {
      throw new AnalyticsRequestError(
        "group_by",
        `group_by value '${dim}' is not valid for /analytics/${resource}. Allowed: ${[...allowed].join(", ")}`,
      );
    }
  }

  // user_type values must be one of the known enum members
  const userTypeRaw = rawMulti("user_type");
  for (const v of userTypeRaw) {
    if (!(VALID_USER_TYPES as string[]).includes(v)) {
      throw new AnalyticsRequestError(
        "user_type",
        `user_type value '${v}' is not valid. Allowed: ${VALID_USER_TYPES.join(", ")}`,
      );
    }
  }

  const filters: AnalyticsFilters = {
    connection: rawMulti("connection"),
    client_id: rawMulti("client_id"),
    user_type: userTypeRaw as AnalyticsUserType[],
    user_id: rawMulti("user_id"),
  };

  const limit = parseInteger(rawSingle("limit"), "limit", DEFAULT_LIMIT, {
    min: 1,
    max: MAX_LIMIT,
  });
  const offset = parseInteger(rawSingle("offset"), "offset", 0, {
    min: 0,
    max: 1_000_000,
  });

  // Ungrouped queries that would scan an unbounded number of rows are unsafe;
  // require either a grouping or a sensibly low limit.
  if (groupBy.length === 0 && limit > MAX_ROWS_UNGROUPED) {
    throw new AnalyticsRequestError(
      "limit",
      `ungrouped queries may not request more than ${MAX_ROWS_UNGROUPED} rows; add group_by or lower limit`,
    );
  }

  const orderByRaw = rawSingle("order_by");
  let orderBy: string | undefined;
  if (orderByRaw) {
    const desc = orderByRaw.startsWith("-");
    const col = desc ? orderByRaw.slice(1) : orderByRaw;
    const allowedOrderColumns = new Set<string>([
      ...groupBy,
      METRIC_BY_RESOURCE[resource],
    ]);
    if (!allowedOrderColumns.has(col)) {
      throw new AnalyticsRequestError(
        "order_by",
        `'order_by' column '${col}' is not selectable. Allowed: ${[...allowedOrderColumns].join(", ")}`,
      );
    }
    orderBy = orderByRaw;
  }

  return {
    from,
    to,
    interval,
    tz,
    filters,
    group_by: groupBy,
    limit,
    offset,
    order_by: orderBy,
  };
}

/**
 * Choose a cache TTL (seconds) based on how recent the queried window is.
 * The lookback `to` boundary drives the choice: queries entirely in the
 * deep past are safe to cache for a day; ones touching the live window
 * need short TTLs so dashboards converge.
 */
export function pickCacheTtlSeconds(
  toIso: string,
  now: number = Date.now(),
): number {
  const toMs = new Date(toIso).getTime();
  const oneHourAgo = now - 60 * 60 * 1000;
  const yesterdayStart = new Date(now);
  yesterdayStart.setUTCHours(0, 0, 0, 0);
  yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  if (toMs >= oneHourAgo) return 60; // future or last hour
  if (toMs >= oneDayAgo) return 5 * 60; // last 24h
  if (toMs < yesterdayStart.getTime()) return 24 * 60 * 60; // before yesterday
  return 60 * 60; // older than 24h but within yesterday
}

function normalizedCacheKey(
  tenantId: string,
  resource: AnalyticsResource,
  params: AnalyticsQueryParams,
): string {
  // Canonicalize all fields so semantically-equivalent requests hit the
  // same key. JSON.stringify with sorted keys is enough here.
  const canon = {
    from: params.from,
    to: params.to,
    interval: params.interval,
    tz: params.tz,
    group_by: [...params.group_by].sort(),
    filters: {
      connection: [...(params.filters.connection || [])].sort(),
      client_id: [...(params.filters.client_id || [])].sort(),
      user_type: [...(params.filters.user_type || [])].sort(),
      user_id: [...(params.filters.user_id || [])].sort(),
    },
    limit: params.limit,
    offset: params.offset,
    order_by: params.order_by || "",
  };
  return `analytics:${tenantId}:${resource}:${JSON.stringify(canon)}`;
}

// Shared query schema (declared for OpenAPI; runtime parsing happens against
// ctx.req.queries to support repeated keys).
const querySchema = z.object({
  from: z
    .string()
    .datetime()
    .optional()
    .openapi({ description: "Inclusive lower bound, ISO 8601 datetime" }),
  to: z
    .string()
    .datetime()
    .optional()
    .openapi({ description: "Exclusive upper bound, ISO 8601 datetime" }),
  interval: z
    .enum(["hour", "day", "week", "month"])
    .optional()
    .openapi({ description: "Time bucket size for time-grouped queries" }),
  tz: z
    .string()
    .optional()
    .openapi({ description: "IANA timezone, e.g. Europe/Madrid" }),
  group_by: z.string().optional().openapi({
    description: "Comma-separated dimensions, e.g. 'time,connection'",
  }),
  connection: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .openapi({
      description: "Repeatable. Filter to one or more connection names.",
    }),
  client_id: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .openapi({
      description: "Repeatable. Filter to one or more client IDs.",
    }),
  user_type: z
    .union([
      z.enum(["password", "social", "passwordless", "enterprise"]),
      z.array(z.enum(["password", "social", "passwordless", "enterprise"])),
    ])
    .optional()
    .openapi({ description: "Repeatable." }),
  user_id: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .openapi({ description: "Repeatable." }),
  limit: z.string().optional().openapi({ description: "Max 10000" }),
  offset: z.string().optional(),
  order_by: z
    .string()
    .optional()
    .openapi({ description: "Column name, prefix with '-' for descending" }),
});

interface AnalyticsRoutesOptions {
  cache?: CacheAdapter;
}

export function createAnalyticsRoutes(options: AnalyticsRoutesOptions = {}) {
  const cache = options.cache;

  const app = new OpenAPIHono<{
    Bindings: Bindings;
    Variables: Variables;
  }>();

  function makeRoute(resource: AnalyticsResource) {
    return createRoute({
      tags: ["analytics"],
      method: "get" as const,
      path: `/${resource}`,
      request: {
        query: querySchema,
        headers: z.object({ "tenant-id": z.string().optional() }),
      },
      security: [{ Bearer: ["read:stats"] }],
      responses: {
        200: {
          content: {
            "application/json": { schema: analyticsQueryResponseSchema },
          },
          description: `${resource} analytics`,
        },
        400: {
          content: { "application/json": { schema: z.any() } },
          description: "Invalid request",
        },
      },
    });
  }

  const handler = (resource: AnalyticsResource) => async (ctx: any) => {
    if (!ctx.env.data.analytics) {
      throw new HTTPException(501, {
        message: "Analytics adapter not configured",
      });
    }

    let parsed: AnalyticsQueryParams;
    try {
      parsed = parseQueryParams(
        resource,
        (k) => ctx.req.query(k) ?? undefined,
        (k) => ctx.req.queries(k) ?? [],
      );
    } catch (err) {
      if (err instanceof AnalyticsRequestError) {
        return ctx.json(
          {
            type: "https://authhero.net/errors/invalid-parameter",
            title: "Invalid parameter",
            status: 400,
            detail: err.detail,
            param: err.param,
          },
          400,
        );
      }
      throw err;
    }

    const tenantId = ctx.var.tenant_id;
    const cacheKey = cache
      ? normalizedCacheKey(tenantId, resource, parsed)
      : null;

    if (cache && cacheKey) {
      const hit = await cache.get(cacheKey);
      if (hit !== null) {
        ctx.header("X-Cache", "HIT");
        return ctx.json(hit);
      }
    }

    const result = await ctx.env.data.analytics.query(
      tenantId,
      resource,
      parsed,
    );

    if (cache && cacheKey) {
      const ttl = pickCacheTtlSeconds(parsed.to);
      // Best effort: cache write failures shouldn't fail the request.
      cache.set(cacheKey, result, ttl).catch(() => {});
      ctx.header("X-Cache", "MISS");
      ctx.header("Cache-Control", `public, max-age=${ttl}`);
    }

    return ctx.json(result);
  };

  const resources: AnalyticsResource[] = [
    "active-users",
    "logins",
    "signups",
    "refresh-tokens",
    "sessions",
    "logouts",
    "password-changes",
    "mfa",
    "email-verifications",
    "codes-sent",
  ];

  for (const resource of resources) {
    app.openapi(makeRoute(resource), handler(resource));
  }

  return app;
}
