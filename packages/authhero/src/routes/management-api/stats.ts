import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { dailyStatsSchema, DailyStats } from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";

import { defineRoute } from "../../utils/define-route";
function parseYYYYMMDD(dateStr: string): string {
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

function toDateString(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

// Auth0's /stats/daily returns one row per day in the requested range, even
// for days with zero events. Adapters only return rows for days that have
// logs, so we fill the gaps here.
function zeroFillDailyStats(
  rows: DailyStats[],
  fromDate: string,
  toDate: string,
): DailyStats[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const out: DailyStats[] = [];
  const start = new Date(`${fromDate}T00:00:00.000Z`);
  const end = new Date(`${toDate}T00:00:00.000Z`);
  for (let d = start; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = toDateString(d);
    const existing = byDate.get(date);
    if (existing) {
      out.push(existing);
    } else {
      const ts = `${date}T00:00:00.000Z`;
      out.push({
        date,
        logins: 0,
        signups: 0,
        leaked_passwords: 0,
        created_at: ts,
        updated_at: ts,
      });
    }
  }
  return out;
}
const getDaily = defineRoute({
  route: createRoute({
    tags: ["stats"],
    method: "get",
    path: "/daily",
    request: {
      query: z.object({
        from: z.string().optional().openapi({
          description:
            "Optional first day of the date range (inclusive) in YYYYMMDD format",
          example: "20251120",
        }),
        to: z.string().optional().openapi({
          description:
            "Optional last day of the date range (inclusive) in YYYYMMDD format",
          example: "20251219",
        }),
      }),
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
    },
    security: [
      {
        Bearer: ["read:stats"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.array(dailyStatsSchema),
          },
        },
        description:
          "Daily statistics including logins, signups, and leaked passwords",
      },
    },
  }),
  handler: async (ctx) => {
    const { from, to } = ctx.req.valid("query");

    if (!ctx.env.data.stats) {
      throw new HTTPException(501, {
        message: "Stats adapter not configured",
      });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
    const fromDate = from ? parseYYYYMMDD(from) : toDateString(thirtyDaysAgo);
    const toDate = to ? parseYYYYMMDD(to) : toDateString(now);

    const stats = await ctx.env.data.stats.getDaily(ctx.var.tenant_id, {
      from: fromDate,
      to: toDate,
    });

    return ctx.json(zeroFillDailyStats(stats, fromDate, toDate));
  },
});

const getActiveUsers = defineRoute({
  route: createRoute({
    tags: ["stats"],
    method: "get",
    path: "/active-users",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
    },
    security: [
      {
        Bearer: ["read:stats"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.number().openapi({
              description: "Number of active users in the last 30 days",
              example: 1234,
            }),
          },
        },
        description: "Number of active users in the last 30 days",
      },
    },
  }),
  handler: async (ctx) => {
    if (!ctx.env.data.stats) {
      throw new HTTPException(501, {
        message: "Stats adapter not configured",
      });
    }

    const activeUsers = await ctx.env.data.stats.getActiveUsers(
      ctx.var.tenant_id,
    );

    return ctx.json(activeUsers);
  },
});

export const statsRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([getDaily, getActiveUsers] as const);
