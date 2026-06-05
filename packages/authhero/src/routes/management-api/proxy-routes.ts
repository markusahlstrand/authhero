import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { Bindings, Variables } from "../../types";
import {
  proxyRouteInsertSchema,
  proxyRouteSchema,
  proxyRouteUpdateSchema,
} from "@authhero/adapter-interfaces";
import { defineRoute } from "../../utils/define-route";
import { enqueueControlPlaneSyncEvent } from "../../helpers/control-plane-sync-events";

const listResponseSchema = z.object({
  proxy_routes: z.array(proxyRouteSchema),
  start: z.number(),
  limit: z.number(),
  length: z.number(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(0).optional(),
  per_page: z.coerce.number().int().min(1).max(200).optional(),
  custom_domain_id: z.string().optional(),
});

const idParamSchema = z.object({ id: z.string() });
const tenantHeaderSchema = z.object({ "tenant-id": z.string().optional() });

function requireProxyRoutes(ctx: { env: Bindings }) {
  const proxyRoutes = ctx.env.data.proxyRoutes;
  if (!proxyRoutes) {
    throw new HTTPException(501, {
      message: "Proxy routes adapter not configured",
    });
  }
  return proxyRoutes;
}

const listRoutes = defineRoute({
  route: createRoute({
    tags: ["proxy-routes"],
    method: "get",
    path: "/",
    request: {
      query: listQuerySchema,
      headers: tenantHeaderSchema,
    },
    security: [{ Bearer: ["read:proxy_routes"] }],
    responses: {
      200: {
        content: { "application/json": { schema: listResponseSchema } },
        description: "List of proxy routes",
      },
    },
  }),
  handler: async (ctx) => {
    const proxyRoutes = requireProxyRoutes(ctx);
    const q = ctx.req.valid("query");
    const result = await proxyRoutes.list(ctx.var.tenant_id, {
      page: q.page,
      per_page: q.per_page,
      custom_domain_id: q.custom_domain_id,
    });
    return ctx.json(result);
  },
});

const getById = defineRoute({
  route: createRoute({
    tags: ["proxy-routes"],
    method: "get",
    path: "/{id}",
    request: {
      params: idParamSchema,
      headers: tenantHeaderSchema,
    },
    security: [{ Bearer: ["read:proxy_routes"] }],
    responses: {
      200: {
        content: { "application/json": { schema: proxyRouteSchema } },
        description: "A proxy route",
      },
    },
  }),
  handler: async (ctx) => {
    const proxyRoutes = requireProxyRoutes(ctx);
    const { id } = ctx.req.valid("param");
    const route = await proxyRoutes.get(ctx.var.tenant_id, id);
    if (!route) throw new HTTPException(404);
    return ctx.json(route);
  },
});

const postRoot = defineRoute({
  route: createRoute({
    tags: ["proxy-routes"],
    method: "post",
    path: "/",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object(proxyRouteInsertSchema.shape),
          },
        },
      },
      headers: tenantHeaderSchema,
    },
    security: [{ Bearer: ["create:proxy_routes"] }],
    responses: {
      201: {
        content: { "application/json": { schema: proxyRouteSchema } },
        description: "Created proxy route",
      },
    },
  }),
  handler: async (ctx) => {
    const proxyRoutes = requireProxyRoutes(ctx);
    const body = ctx.req.valid("json");
    const route = await proxyRoutes.create(ctx.var.tenant_id, body);
    enqueueControlPlaneSyncEvent(ctx, {
      tenantId: ctx.var.tenant_id,
      entity: "proxy_route",
      op: "created",
      aggregateId: route.id,
      payload: route,
    });
    return ctx.json(route, { status: 201 });
  },
});

const patchById = defineRoute({
  route: createRoute({
    tags: ["proxy-routes"],
    method: "patch",
    path: "/{id}",
    request: {
      params: idParamSchema,
      body: {
        content: {
          "application/json": {
            schema: z.object(proxyRouteUpdateSchema.shape).partial(),
          },
        },
      },
      headers: tenantHeaderSchema,
    },
    security: [{ Bearer: ["update:proxy_routes"] }],
    responses: {
      200: {
        content: { "application/json": { schema: proxyRouteSchema } },
        description: "Updated proxy route",
      },
    },
  }),
  handler: async (ctx) => {
    const proxyRoutes = requireProxyRoutes(ctx);
    const { id } = ctx.req.valid("param");
    const body = ctx.req.valid("json");
    const ok = await proxyRoutes.update(ctx.var.tenant_id, id, body);
    if (!ok) throw new HTTPException(404);
    const updated = await proxyRoutes.get(ctx.var.tenant_id, id);
    if (!updated) throw new HTTPException(404);
    enqueueControlPlaneSyncEvent(ctx, {
      tenantId: ctx.var.tenant_id,
      entity: "proxy_route",
      op: "updated",
      aggregateId: id,
      payload: updated,
    });
    return ctx.json(updated);
  },
});

const deleteById = defineRoute({
  route: createRoute({
    tags: ["proxy-routes"],
    method: "delete",
    path: "/{id}",
    request: {
      params: idParamSchema,
      headers: tenantHeaderSchema,
    },
    security: [{ Bearer: ["delete:proxy_routes"] }],
    responses: {
      204: { description: "Deleted" },
    },
  }),
  handler: async (ctx) => {
    const proxyRoutes = requireProxyRoutes(ctx);
    const { id } = ctx.req.valid("param");
    // Snapshot before delete so the sync event carries the pre-delete payload.
    const beforeDelete = await proxyRoutes.get(ctx.var.tenant_id, id);
    const ok = await proxyRoutes.remove(ctx.var.tenant_id, id);
    if (!ok) throw new HTTPException(404);
    if (beforeDelete) {
      enqueueControlPlaneSyncEvent(ctx, {
        tenantId: ctx.var.tenant_id,
        entity: "proxy_route",
        op: "deleted",
        aggregateId: id,
        payload: beforeDelete,
      });
    }
    return ctx.body(null, 204);
  },
});

export const proxyRoutesRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([
  listRoutes,
  getById,
  postRoot,
  patchById,
  deleteById,
] as const);
