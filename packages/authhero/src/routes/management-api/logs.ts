import { Bindings } from "../../types";
import { HTTPException } from "hono/http-exception";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { querySchema } from "../../types/auth0/Query";
import { parseSort } from "../../utils/sort";
import { logSchema, totalsSchema } from "@authhero/adapter-interfaces";

const logsWithTotalsSchema = totalsSchema.extend({
  logs: z.array(logSchema),
});

export const logRoutes = new OpenAPIHono<{ Bindings: Bindings }>()
  // --------------------------------
  // GET /logs
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["logs"],
      method: "get",
      path: "/",
      request: {
        query: querySchema,
        headers: z.object({
          "tenant-id": z.string(),
        }),
      },
      security: [
        {
          Bearer: ["auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.union([z.array(logSchema), logsWithTotalsSchema]),
            },
          },
          description: "List of log rows",
        },
      },
    }),
    async (ctx) => {
      const { page, per_page, include_totals, sort, q } =
        ctx.req.valid("query");
      const { "tenant-id": tenant_id } = ctx.req.valid("header");

      const result = await ctx.env.data.logs.list(tenant_id, {
        page,
        per_page,
        include_totals,
        sort: parseSort(sort),
        q,
      });

      if (include_totals) {
        return ctx.json(result);
      }

      return ctx.json(result.logs);
    },
  )
  // --------------------------------
  // GET /logs/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["logs"],
      method: "get",
      path: "/{id}",
      request: {
        headers: z.object({
          "tenant-id": z.string(),
        }),
        params: z.object({
          id: z.string(),
        }),
      },

      security: [
        {
          Bearer: ["auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: logSchema,
            },
          },
          description: "A log entry",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id } = ctx.req.valid("param");

      const log = await ctx.env.data.logs.get(tenant_id, id);

      if (!log) {
        throw new HTTPException(404);
      }

      return ctx.json(log);
    },
  );
