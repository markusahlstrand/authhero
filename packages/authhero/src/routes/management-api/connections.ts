import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { HTTPException } from "hono/http-exception";
import { querySchema } from "../../types";
import {
  connectionInsertSchema,
  connectionSchema,
  totalsSchema,
} from "@authhero/adapter-interfaces";
import { parseSort } from "../../utils/sort";
import { generateConnectionId } from "../../utils/entity-id";

const connectionsWithTotalsSchema = totalsSchema.extend({
  connections: z.array(connectionSchema),
});

// Schema for the connection clients response
const connectionClientsResponseSchema = z.object({
  enabled_clients: z.array(
    z.object({
      client_id: z.string(),
      name: z.string(),
    }),
  ),
});

// Schema for updating connection clients
const updateConnectionClientsSchema = z.array(
  z.object({
    client_id: z.string(),
    status: z.boolean(),
  }),
);

export const connectionRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /api/v2/connections
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["connections"],
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
              schema: z.union([
                z.array(connectionSchema),
                connectionsWithTotalsSchema,
              ]),
            },
          },
          description: "List of connectionss",
        },
      },
    }),
    async (ctx) => {
      const {
        page,
        per_page,
        include_totals = false,
        sort,
        q,
      } = ctx.req.valid("query");

      const result = await ctx.env.data.connections.list(ctx.var.tenant_id, {
        page,
        per_page,
        include_totals,
        sort: parseSort(sort),
        q,
      });

      if (!include_totals) {
        return ctx.json(result.connections);
      }

      return ctx.json(result);
    },
  )
  // --------------------------------
  // GET /api/v2/connections/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["connections"],
      method: "get",
      path: "/{id}",
      request: {
        params: z.object({
          id: z.string(),
        }),
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
              schema: connectionSchema,
            },
          },
          description: "A connection",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");

      const connection = await ctx.env.data.connections.get(
        ctx.var.tenant_id,
        id,
      );

      if (!connection) {
        throw new HTTPException(404);
      }

      return ctx.json(connection);
    },
  )
  // --------------------------------
  // DELETE /api/v2/connections/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["connections"],
      method: "delete",
      path: "/{id}",
      request: {
        params: z.object({
          id: z.string(),
        }),
        headers: z.object({
          "tenant-id": z.string(),
        }),
      },
      security: [
        {
          Bearer: ["auth:write"],
        },
      ],
      responses: {
        200: {
          description: "Status",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");
      const tenantId = ctx.var.tenant_id;

      const result = await ctx.env.data.connections.remove(tenantId, id);
      if (!result) {
        throw new HTTPException(404, {
          message: "Connection not found",
        });
      }

      return ctx.text("OK");
    },
  )
  // --------------------------------
  // PATCH /api/v2/connections/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["connections"],
      method: "patch",
      path: "/{id}",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object(connectionInsertSchema.shape).partial(),
            },
          },
        },
        params: z.object({
          id: z.string(),
        }),
        headers: z.object({
          "tenant-id": z.string(),
        }),
      },
      security: [
        {
          Bearer: ["auth:write"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: connectionSchema,
            },
          },
          description: "The updated connection",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");
      const body = ctx.req.valid("json");
      const tenantId = ctx.var.tenant_id;

      const result = await ctx.env.data.connections.update(tenantId, id, body);
      if (!result) {
        throw new HTTPException(404, {
          message: "Connection not found",
        });
      }

      const connection = await ctx.env.data.connections.get(tenantId, id);

      if (!connection) {
        throw new HTTPException(404, {
          message: "Connection not found",
        });
      }

      return ctx.json(connection);
    },
  )
  // --------------------------------
  // POST /api/v2/connections
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["connections"],
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object(connectionInsertSchema.shape),
            },
          },
        },
        headers: z.object({
          "tenant-id": z.string(),
        }),
      },
      security: [
        {
          Bearer: ["auth:write"],
        },
      ],
      responses: {
        201: {
          content: {
            "application/json": {
              schema: connectionSchema,
            },
          },
          description: "A connection",
        },
      },
    }),
    async (ctx) => {
      const body = ctx.req.valid("json");
      const tenantId = ctx.var.tenant_id;

      // Generate ID if not provided
      const connectionId = body.id || generateConnectionId();

      const connection = await ctx.env.data.connections.create(tenantId, {
        ...body,
        id: connectionId,
      });

      return ctx.json(connection, { status: 201 });
    },
  )
  // --------------------------------
  // GET /api/v2/connections/:id/clients
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["connections"],
      method: "get",
      path: "/{id}/clients",
      request: {
        params: z.object({
          id: z.string(),
        }),
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
              schema: connectionClientsResponseSchema,
            },
          },
          description: "List of clients enabled for this connection",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");

      // First verify the connection exists
      const connection = await ctx.env.data.connections.get(
        ctx.var.tenant_id,
        id,
      );

      if (!connection) {
        throw new HTTPException(404, {
          message: "Connection not found",
        });
      }

      // Get all clients in this tenant
      const { clients } = await ctx.env.data.clients.list(ctx.var.tenant_id, {
        per_page: 1000,
      });

      // Filter to clients that have this connection enabled
      const enabledClients = clients
        .filter((client) => client.connections?.includes(id))
        .map((client) => ({
          client_id: client.client_id,
          name: client.name,
        }));

      return ctx.json({ enabled_clients: enabledClients });
    },
  )
  // --------------------------------
  // PATCH /api/v2/connections/:id/clients
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["connections"],
      method: "patch",
      path: "/{id}/clients",
      request: {
        body: {
          content: {
            "application/json": {
              schema: updateConnectionClientsSchema,
            },
          },
        },
        params: z.object({
          id: z.string(),
        }),
        headers: z.object({
          "tenant-id": z.string(),
        }),
      },
      security: [
        {
          Bearer: ["auth:write"],
        },
      ],
      responses: {
        200: {
          description: "Clients updated successfully",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");
      const body = ctx.req.valid("json");

      // First verify the connection exists
      const connection = await ctx.env.data.connections.get(
        ctx.var.tenant_id,
        id,
      );

      if (!connection) {
        throw new HTTPException(404, {
          message: "Connection not found",
        });
      }

      // Process each client update
      for (const clientUpdate of body) {
        const client = await ctx.env.data.clients.get(
          ctx.var.tenant_id,
          clientUpdate.client_id,
        );

        if (!client) {
          continue; // Skip non-existent clients
        }

        const currentConnections = client.connections || [];

        if (clientUpdate.status) {
          // Enable: Add connection if not already present
          if (!currentConnections.includes(id)) {
            await ctx.env.data.clients.update(
              ctx.var.tenant_id,
              clientUpdate.client_id,
              {
                connections: [...currentConnections, id],
              },
            );
          }
        } else {
          // Disable: Remove connection if present
          if (currentConnections.includes(id)) {
            await ctx.env.data.clients.update(
              ctx.var.tenant_id,
              clientUpdate.client_id,
              {
                connections: currentConnections.filter((c) => c !== id),
              },
            );
          }
        }
      }

      return ctx.text("OK");
    },
  );
