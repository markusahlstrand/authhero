import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { HTTPException } from "hono/http-exception";
import { querySchema } from "../../types";
import {
  resourceServerInsertSchema,
  resourceServerSchema,
  totalsSchema,
} from "@authhero/adapter-interfaces";
import { parseSort } from "../../utils/sort";

const resourceServersWithTotalsSchema = totalsSchema.extend({
  resource_servers: z.array(resourceServerSchema),
});

export const resourceServerRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /api/v2/resource-servers
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["resource-servers"],
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
          Bearer: ["read:resource-servers", "auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.union([
                z.array(resourceServerSchema),
                resourceServersWithTotalsSchema,
              ]),
            },
          },
          description: "List of resource servers",
        },
      },
    }),
    async (ctx) => {
      const tenant_id = ctx.var.tenant_id;

      const {
        page,
        per_page,
        include_totals = false,
        sort,
        q,
      } = ctx.req.valid("query");

      const result = await ctx.env.data.resourceServers.list(tenant_id, {
        page,
        per_page,
        include_totals,
        sort: parseSort(sort),
        q,
      });

      if (!include_totals) {
        return ctx.json(result.resource_servers);
      }

      return ctx.json(result);
    },
  )
  // --------------------------------
  // GET /api/v2/resource-servers/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["resource-servers"],
      method: "get",
      path: "/{id}",
      request: {
        params: z.object({
          id: z.string(),
        }),
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
      },

      security: [
        {
          Bearer: ["read:resource-servers", "auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: resourceServerSchema,
            },
          },
          description: "A resource server",
        },
      },
    }),
    async (ctx) => {
      const tenant_id = ctx.var.tenant_id;
      const { id } = ctx.req.valid("param");

      const resourceServer = await ctx.env.data.resourceServers.get(
        tenant_id,
        id,
      );

      if (!resourceServer) {
        throw new HTTPException(404);
      }

      return ctx.json(resourceServer);
    },
  )
  // --------------------------------
  // DELETE /api/v2/resource-servers/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["resource-servers"],
      method: "delete",
      path: "/{id}",
      request: {
        params: z.object({
          id: z.string(),
        }),
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
      },
      security: [
        {
          Bearer: ["delete:resource-servers", "auth:write"],
        },
      ],
      responses: {
        200: {
          description: "Status",
        },
      },
    }),
    async (ctx) => {
      const tenant_id = ctx.var.tenant_id;
      const { id } = ctx.req.valid("param");

      const resourceServer = await ctx.env.data.resourceServers.get(
        tenant_id,
        id,
      );

      if (!resourceServer) {
        throw new HTTPException(404, {
          message: "Resource server not found",
        });
      }

      if (resourceServer.is_system) {
        throw new HTTPException(403, {
          message: "System entities cannot be deleted",
        });
      }

      await ctx.env.data.resourceServers.remove(tenant_id, id);

      return ctx.text("OK");
    },
  )
  // --------------------------------
  // PATCH /api/v2/resource-servers/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["resource-servers"],
      method: "patch",
      path: "/{id}",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object(resourceServerInsertSchema.shape).partial(),
            },
          },
        },
        params: z.object({
          id: z.string(),
        }),
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
      },
      security: [
        {
          Bearer: ["update:resource-servers", "auth:write"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: resourceServerSchema,
            },
          },
          description: "The updated resource server",
        },
      },
    }),
    async (ctx) => {
      const tenant_id = ctx.var.tenant_id;
      const { id } = ctx.req.valid("param");
      const body = ctx.req.valid("json");

      const existingResourceServer = await ctx.env.data.resourceServers.get(
        tenant_id,
        id,
      );

      if (!existingResourceServer) {
        throw new HTTPException(404, {
          message: "Resource server not found",
        });
      }

      if (existingResourceServer.is_system) {
        throw new HTTPException(403, {
          message: "System entities cannot be modified",
        });
      }

      await ctx.env.data.resourceServers.update(tenant_id, id, body);

      const resourceServer = await ctx.env.data.resourceServers.get(
        tenant_id,
        id,
      );

      if (!resourceServer) {
        throw new HTTPException(404, {
          message: "Resource server not found",
        });
      }

      return ctx.json(resourceServer);
    },
  )
  // --------------------------------
  // POST /api/v2/resource-servers
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["resource-servers"],
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object(resourceServerInsertSchema.shape),
            },
          },
        },
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
      },
      security: [
        {
          Bearer: ["create:resource-servers", "auth:write"],
        },
      ],
      responses: {
        201: {
          content: {
            "application/json": {
              schema: resourceServerSchema,
            },
          },
          description: "A resource server",
        },
      },
    }),
    async (ctx) => {
      const tenant_id = ctx.var.tenant_id;
      const body = ctx.req.valid("json");

      const resourceServer = await ctx.env.data.resourceServers.create(
        tenant_id,
        body,
      );

      return ctx.json(resourceServer, { status: 201 });
    },
  );
