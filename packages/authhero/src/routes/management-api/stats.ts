import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { dailyStatsSchema } from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";

export const statsRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /stats/daily
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["stats"],
      method: "get",
      path: "/daily",
      request: {
        query: z.object({
          from: z
            .string()
            .optional()
            .openapi({
              description:
                "Optional first day of the date range (inclusive) in YYYYMMDD format",
              example: "20251120",
            }),
          to: z
            .string()
            .optional()
            .openapi({
              description:
                "Optional last day of the date range (inclusive) in YYYYMMDD format",
              example: "20251219",
            }),
        }),
        headers: z.object({
          "tenant-id": z.string(),
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
    async (ctx) => {
      const { from, to } = ctx.req.valid("query");

      if (!ctx.env.data.stats) {
        throw new HTTPException(501, {
          message: "Stats adapter not configured",
        });
      }

      const stats = await ctx.env.data.stats.getDaily(ctx.var.tenant_id, {
        from,
        to,
      });

      return ctx.json(stats);
    },
  )
  // --------------------------------
  // GET /stats/active-users
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["stats"],
      method: "get",
      path: "/active-users",
      request: {
        headers: z.object({
          "tenant-id": z.string(),
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
    async (ctx) => {
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
  );
