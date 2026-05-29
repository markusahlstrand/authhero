import { Bindings, Variables } from "../../types";
import { HTTPException } from "hono/http-exception";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { querySchema } from "../../types/auth0/Query";
import { parseSort } from "../../utils/sort";
import { logSchema, totalsSchema } from "@authhero/adapter-interfaces";

import { defineRoute } from "../../utils/define-route";
const logsWithTotalsSchema = totalsSchema.extend({
  logs: z.array(logSchema),
});
const getRoot = defineRoute({
  route: createRoute({
    tags: ["logs"],
    method: "get",
    path: "/",
    request: {
      query: querySchema,
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
    },
    security: [
      {
        Bearer: ["read:logs"],
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
  handler: async (ctx) => {
    const { page, per_page, include_totals, sort, q, from_date, to_date } =
      ctx.req.valid("query");

    const result = await ctx.env.data.logs.list(ctx.var.tenant_id, {
      page,
      per_page,
      include_totals,
      sort: parseSort(sort),
      q,
      from_date,
      to_date,
    });

    if (include_totals) {
      return ctx.json(result);
    }

    return ctx.json(result.logs);
  },
});

const getById = defineRoute({
  route: createRoute({
    tags: ["logs"],
    method: "get",
    path: "/{id}",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      params: z.object({
        id: z.string(),
      }),
    },

    security: [
      {
        Bearer: ["read:logs"],
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
  handler: async (ctx) => {
    const { id } = ctx.req.valid("param");

    const log = await ctx.env.data.logs.get(ctx.var.tenant_id, id);

    if (!log) {
      throw new HTTPException(404);
    }

    return ctx.json(log);
  },
});

export const logRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([getRoot, getById] as const);
