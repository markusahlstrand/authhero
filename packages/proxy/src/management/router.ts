import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import type { MiddlewareHandler } from "hono";
import { ProxyDataAdapter } from "../adapter";
import {
  proxyRouteInsertSchema,
  proxyRouteSchema,
  proxyRouteUpdateSchema,
} from "../types";

interface ManagementVariables {
  tenant_id: string;
}

export interface ProxyManagementOptions {
  data: ProxyDataAdapter;
  auth?: MiddlewareHandler<{ Variables: ManagementVariables }>;
}

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

export function createProxyManagementRouter(
  options: ProxyManagementOptions,
): OpenAPIHono<{ Variables: ManagementVariables }> {
  const app = new OpenAPIHono<{ Variables: ManagementVariables }>();
  const { data, auth } = options;

  if (auth) app.use("*", auth);

  app.openapi(
    createRoute({
      tags: ["proxy-routes"],
      method: "get",
      path: "/",
      request: { query: listQuerySchema },
      security: [{ Bearer: ["read:proxy_routes"] }],
      responses: {
        200: {
          content: { "application/json": { schema: listResponseSchema } },
          description: "List of proxy routes",
        },
      },
    }),
    async (ctx) => {
      const tenantId = requireTenant(ctx.var.tenant_id);
      const q = ctx.req.valid("query");
      const result = await data.proxyRoutes.list(tenantId, {
        page: q.page,
        per_page: q.per_page,
        custom_domain_id: q.custom_domain_id,
      });
      return ctx.json(result);
    },
  );

  app.openapi(
    createRoute({
      tags: ["proxy-routes"],
      method: "get",
      path: "/{id}",
      request: { params: idParamSchema },
      security: [{ Bearer: ["read:proxy_routes"] }],
      responses: {
        200: {
          content: { "application/json": { schema: proxyRouteSchema } },
          description: "A proxy route",
        },
      },
    }),
    async (ctx) => {
      const tenantId = requireTenant(ctx.var.tenant_id);
      const { id } = ctx.req.valid("param");
      const route = await data.proxyRoutes.get(tenantId, id);
      if (!route) throw new HTTPException(404);
      return ctx.json(route);
    },
  );

  app.openapi(
    createRoute({
      tags: ["proxy-routes"],
      method: "post",
      path: "/",
      request: {
        body: {
          content: { "application/json": { schema: proxyRouteInsertSchema } },
        },
      },
      security: [{ Bearer: ["create:proxy_routes"] }],
      responses: {
        201: {
          content: { "application/json": { schema: proxyRouteSchema } },
          description: "Created proxy route",
        },
      },
    }),
    async (ctx) => {
      const tenantId = requireTenant(ctx.var.tenant_id);
      const body = ctx.req.valid("json");
      const route = await data.proxyRoutes.create(tenantId, body);
      return ctx.json(route, 201);
    },
  );

  app.openapi(
    createRoute({
      tags: ["proxy-routes"],
      method: "patch",
      path: "/{id}",
      request: {
        params: idParamSchema,
        body: {
          content: { "application/json": { schema: proxyRouteUpdateSchema } },
        },
      },
      security: [{ Bearer: ["update:proxy_routes"] }],
      responses: {
        200: {
          content: { "application/json": { schema: proxyRouteSchema } },
          description: "Updated proxy route",
        },
      },
    }),
    async (ctx) => {
      const tenantId = requireTenant(ctx.var.tenant_id);
      const { id } = ctx.req.valid("param");
      const body = ctx.req.valid("json");
      const ok = await data.proxyRoutes.update(tenantId, id, body);
      if (!ok) throw new HTTPException(404);
      const updated = await data.proxyRoutes.get(tenantId, id);
      if (!updated) throw new HTTPException(404);
      return ctx.json(updated);
    },
  );

  app.openapi(
    createRoute({
      tags: ["proxy-routes"],
      method: "delete",
      path: "/{id}",
      request: { params: idParamSchema },
      security: [{ Bearer: ["delete:proxy_routes"] }],
      responses: { 204: { description: "Deleted" } },
    }),
    async (ctx) => {
      const tenantId = requireTenant(ctx.var.tenant_id);
      const { id } = ctx.req.valid("param");
      const ok = await data.proxyRoutes.remove(tenantId, id);
      if (!ok) throw new HTTPException(404);
      return ctx.body(null, 204);
    },
  );

  return app;
}

function requireTenant(tenantId: string | undefined): string {
  if (!tenantId) {
    throw new HTTPException(401, { message: "Missing tenant context" });
  }
  return tenantId;
}
