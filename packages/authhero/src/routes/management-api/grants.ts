import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { HTTPException } from "hono/http-exception";
import { grantSchema } from "@authhero/adapter-interfaces";

import { defineRoute } from "../../utils/define-route";
import { requireTenantId, withTotals, listResponse } from "./helpers";

const grantsQuerySchema = z.object({
  per_page: z
    .string()
    .optional()
    .default("50")
    .transform((p) => parseInt(p, 10))
    .openapi({ description: "Number of results per page. Defaults to 50." }),
  page: z
    .string()
    .optional()
    .default("0")
    .transform((p) => parseInt(p, 10))
    .openapi({
      description: "Page index of the results to return. First page is 0.",
    }),
  include_totals: z
    .string()
    .optional()
    .default("false")
    .transform((v) => v === "true")
    .openapi({
      description:
        "Return totals envelope (true) or a plain array (false, default).",
    }),
  user_id: z.string().optional().openapi({
    description: "Filter grants by user_id.",
  }),
  client_id: z.string().optional().openapi({
    description: "Filter grants by clientID.",
  }),
  audience: z.string().optional().openapi({
    description: "Filter grants by audience.",
  }),
});

const grantsWithTotalsSchema = withTotals({
  grants: z.array(grantSchema),
});

const getRoot = defineRoute({
  route: createRoute({
    tags: ["grants"],
    method: "get",
    path: "/",
    request: {
      query: grantsQuerySchema,
      headers: z.object({ "tenant-id": z.string().optional() }),
    },
    security: [{ Bearer: ["read:grants", "auth:read"] }],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.union([z.array(grantSchema), grantsWithTotalsSchema]),
          },
        },
        description: "List of OAuth grants",
      },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const { page, per_page, include_totals, user_id, client_id, audience } =
      ctx.req.valid("query");

    if (!ctx.env.data.grants) {
      if (!include_totals) {
        return ctx.json([]);
      }
      return ctx.json({ grants: [], start: 0, limit: 0, length: 0 });
    }

    const queryParts: string[] = [];
    if (user_id) queryParts.push(`user_id:"${user_id}"`);
    if (client_id) queryParts.push(`client_id:"${client_id}"`);
    if (audience) queryParts.push(`audience:"${audience}"`);
    const luceneQuery =
      queryParts.length > 0 ? queryParts.join(" AND ") : undefined;

    const result = await ctx.env.data.grants.list(tenantId, {
      page,
      per_page,
      include_totals,
      q: luceneQuery,
    });

    return ctx.json(listResponse(include_totals, result, "grants"));
  },
});

const deleteById = defineRoute({
  route: createRoute({
    tags: ["grants"],
    method: "delete",
    path: "/{id}",
    request: {
      headers: z.object({ "tenant-id": z.string().optional() }),
      params: z.object({ id: z.string() }),
    },
    security: [{ Bearer: ["delete:grants"] }],
    responses: {
      204: { description: "Grant removed" },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const { id } = ctx.req.valid("param");
    if (!ctx.env.data.grants) {
      throw new HTTPException(404);
    }
    const removed = await ctx.env.data.grants.remove(tenantId, id);
    if (!removed) {
      throw new HTTPException(404);
    }
    return ctx.body(null, 204);
  },
});

const deleteByUserId = defineRoute({
  route: createRoute({
    tags: ["grants"],
    method: "delete",
    path: "/",
    request: {
      query: z.object({
        user_id: z.string().openapi({
          description: "Delete all grants for the given user_id.",
        }),
      }),
      headers: z.object({ "tenant-id": z.string().optional() }),
    },
    security: [{ Bearer: ["delete:grants"] }],
    responses: {
      204: { description: "Grants removed" },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const { user_id } = ctx.req.valid("query");
    if (!ctx.env.data.grants) {
      return ctx.body(null, 204);
    }
    await ctx.env.data.grants.removeByUser(tenantId, user_id);
    return ctx.body(null, 204);
  },
});

export const grantRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([getRoot, deleteById, deleteByUserId] as const);
