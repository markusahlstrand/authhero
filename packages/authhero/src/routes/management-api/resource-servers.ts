import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Context } from "hono";
import { Bindings, Variables } from "../../types";
import { HTTPException } from "hono/http-exception";
import { querySchema } from "../../types";
import {
  resourceServerInsertSchema,
  resourceServerSchema,
  ResourceServer,
  totalsSchema,
  LogTypes,
} from "@authhero/adapter-interfaces";
import { parseSort } from "../../utils/sort";
import { logMessage } from "../../helpers/logging";

import { defineRoute } from "../../utils/define-route";
const resourceServersWithTotalsSchema = totalsSchema.extend({
  resource_servers: z.array(resourceServerSchema),
});

// Auth0 lets clients reference a resource server by either its UUID id or its
// URL identifier. SDKs (e.g. terraform-provider-auth0) commonly pass the
// identifier. Look up by id first; on miss, scan by identifier.
async function resolveResourceServer(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
  idOrIdentifier: string,
): Promise<ResourceServer | null> {
  const direct = await ctx.env.data.resourceServers.get(
    tenantId,
    idOrIdentifier,
  );
  if (direct) return direct;
  const list = await ctx.env.data.resourceServers.list(tenantId, {});
  return (
    list.resource_servers.find((rs) => rs.identifier === idOrIdentifier) ?? null
  );
}
const getRoot = defineRoute({
  route: createRoute({
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
          Bearer: ["read:resource_servers"],
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
  handler: async (ctx) => {
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
});

const getById = defineRoute({
  route: createRoute({
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
          Bearer: ["read:resource_servers"],
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
  handler: async (ctx) => {
      const tenant_id = ctx.var.tenant_id;
      const { id } = ctx.req.valid("param");

      const resourceServer = await resolveResourceServer(ctx, tenant_id, id);

      if (!resourceServer) {
        throw new HTTPException(404);
      }

      return ctx.json(resourceServer);
    },
});

const deleteById = defineRoute({
  route: createRoute({
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
          Bearer: ["delete:resource_servers"],
        },
      ],
      responses: {
        200: {
          description: "Status",
        },
      },
    }),
  handler: async (ctx) => {
      const tenant_id = ctx.var.tenant_id;
      const { id } = ctx.req.valid("param");

      const resourceServer = await resolveResourceServer(ctx, tenant_id, id);

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

      const tenant = await ctx.env.data.tenants.get(tenant_id);
      if (tenant?.default_audience === resourceServer.identifier) {
        throw new HTTPException(409, {
          message:
            "Resource server is set as the tenant's default_audience; clear it before deleting",
        });
      }

      await ctx.env.data.resourceServers.remove(tenant_id, resourceServer.id!);

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Delete a Resource Server",
        targetType: "resource_server",
        targetId: resourceServer.id!,
        beforeState: resourceServer as unknown as Record<string, unknown>,
      });

      return ctx.text("OK");
    },
});

const patchById = defineRoute({
  route: createRoute({
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
          Bearer: ["update:resource_servers"],
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
  handler: async (ctx) => {
      const tenant_id = ctx.var.tenant_id;
      const { id } = ctx.req.valid("param");
      const body = ctx.req.valid("json");

      const existingResourceServer = await resolveResourceServer(
        ctx,
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

      const realId = existingResourceServer.id!;
      await ctx.env.data.resourceServers.update(tenant_id, realId, body);

      const resourceServer = await ctx.env.data.resourceServers.get(
        tenant_id,
        realId,
      );

      if (!resourceServer) {
        throw new HTTPException(404, {
          message: "Resource server not found",
        });
      }

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Update a Resource Server",
        targetType: "resource_server",
        targetId: resourceServer.id!,
        beforeState: existingResourceServer as unknown as Record<
          string,
          unknown
        >,
        afterState: resourceServer as unknown as Record<string, unknown>,
      });

      return ctx.json(resourceServer);
    },
});

const postRoot = defineRoute({
  route: createRoute({
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
          Bearer: ["create:resource_servers"],
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
  handler: async (ctx) => {
      const tenant_id = ctx.var.tenant_id;
      const body = ctx.req.valid("json");

      const resourceServer = await ctx.env.data.resourceServers.create(
        tenant_id,
        body,
      );

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Create a Resource Server",
        targetType: "resource_server",
        targetId: resourceServer.id,
        afterState: resourceServer as unknown as Record<string, unknown>,
      });

      return ctx.json(resourceServer, { status: 201 });
    },
});


export const resourceServerRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  .openapiRoutes([getRoot, getById, deleteById, patchById, postRoot] as const);
