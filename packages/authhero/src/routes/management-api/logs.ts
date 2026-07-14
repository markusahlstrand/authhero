import { Bindings, Variables } from "../../types";
import { HTTPException } from "hono/http-exception";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { querySchema } from "../../types/auth0/Query";
import { parseSort } from "../../utils/sort";
import { logSchema } from "@authhero/adapter-interfaces";

import { defineRoute } from "../../utils/define-route";
import { requireTenantId, withTotals, listResponse } from "./helpers";
const logsWithTotalsSchema = withTotals({
  logs: z.array(logSchema),
});

// Checkpoint (keyset) pagination response: items plus an opaque cursor.
const logsWithNextSchema = z.object({
  logs: z.array(logSchema),
  next: z.string().optional().openapi({
    description: "Opaque cursor for the next page; absent on the last page.",
  }),
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
            schema: z.union([
              z.array(logSchema),
              logsWithTotalsSchema,
              logsWithNextSchema,
            ]),
          },
        },
        description: "List of log rows",
      },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const {
      page,
      per_page,
      include_totals,
      sort,
      q,
      from,
      take,
      from_date,
      to_date,
    } = ctx.req.valid("query");

    const result = await ctx.env.data.logs.list(tenantId, {
      page,
      per_page,
      include_totals,
      sort: parseSort(sort),
      q,
      from,
      take,
      from_date,
      to_date,
    });

    // Keyset (checkpoint) pagination: return Auth0's { items, next } shape so
    // callers can page past the first page via the opaque cursor.
    if (from !== undefined || take !== undefined) {
      return ctx.json({
        logs: result.logs,
        next: result.next,
      });
    }

    return ctx.json(listResponse(include_totals, result, "logs"));
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
    const tenantId = requireTenantId(ctx);
    const { id } = ctx.req.valid("param");

    const log = await ctx.env.data.logs.get(tenantId, id);

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
