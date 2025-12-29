import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  clientSchema,
  clientInsertSchema,
  totalsSchema,
  connectionSchema,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { HTTPException } from "hono/http-exception";
import { nanoid } from "nanoid";
import { querySchema } from "../../types/auth0/Query";
import { parseSort } from "../../utils/sort";

const clientWithTotalsSchema = totalsSchema.extend({
  clients: z.array(clientSchema),
});

// Schema for client connections response
const clientConnectionsResponseSchema = z.object({
  enabled_connections: z.array(
    z.object({
      connection_id: z.string(),
      connection: connectionSchema.optional(),
    }),
  ),
});

// Schema for updating client connections - ordered array of connection IDs
const updateClientConnectionsSchema = z.array(z.string());

export const clientRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /clients
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["clients"],
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
          Bearer: ["read:clients", "auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.union([clientWithTotalsSchema, z.array(clientSchema)]),
            },
          },
          description: "List of clients",
        },
      },
    }),
    async (ctx) => {
      const tenant_id = ctx.var.tenant_id;
      const { page, per_page, include_totals, sort, q } =
        ctx.req.valid("query");

      const result = await ctx.env.data.clients.list(tenant_id, {
        page,
        per_page,
        include_totals,
        sort: parseSort(sort),
        q,
      });

      const clients = result.clients;

      if (include_totals) {
        // TODO: this should be supported by the adapter
        return ctx.json({
          clients,
          start: 0,
          limit: 10,
          length: clients.length,
        });
      }

      return ctx.json(clients);
    },
  )
  // --------------------------------
  // GET /clients/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["clients"],
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
          Bearer: ["read:clients", "auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: clientSchema,
            },
          },
          description: "A client",
        },
      },
    }),
    async (ctx) => {
      const tenant_id = ctx.var.tenant_id;
      const { id } = ctx.req.valid("param");

      const client = await ctx.env.data.clients.get(tenant_id, id);

      if (!client) {
        throw new HTTPException(404);
      }

      return ctx.json(client);
    },
  )
  // --------------------------------
  // DELETE /clients/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["clients"],
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
          Bearer: ["delete:clients", "auth:write"],
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

      const result = await ctx.env.data.clients.remove(tenant_id, id);
      if (!result) {
        throw new HTTPException(404, { message: "Client not found" });
      }

      return ctx.text("OK");
    },
  )
  // --------------------------------
  // PATCH /clients/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["clients"],
      method: "patch",
      path: "/{id}",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object(clientInsertSchema.shape).partial(),
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
          Bearer: ["update:clients", "auth:write"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: clientSchema,
            },
          },
          description: "The updated client",
        },
      },
    }),
    async (ctx) => {
      const tenant_id = ctx.var.tenant_id;
      const { id } = ctx.req.valid("param");
      const body = ctx.req.valid("json");

      const clientUpdate = body;

      await ctx.env.data.clients.update(tenant_id, id, clientUpdate);
      const client = await ctx.env.data.clients.get(tenant_id, id);

      if (!client) {
        throw new HTTPException(404, { message: "Client not found" });
      }

      return ctx.json(client);
    },
  )
  // --------------------------------
  // POST /clients
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["clients"],
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object(clientInsertSchema.shape),
            },
          },
        },
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
      },
      security: [
        {
          Bearer: ["create:clients", "auth:write"],
        },
      ],
      responses: {
        201: {
          content: {
            "application/json": {
              schema: z.object(clientSchema.shape),
            },
          },
          description: "A client",
        },
      },
    }),
    async (ctx) => {
      const tenant_id = ctx.var.tenant_id;
      const body = ctx.req.valid("json");

      const clientCreate = {
        ...body,
        client_secret: body.client_secret || nanoid(),
      };

      const client = await ctx.env.data.clients.create(tenant_id, clientCreate);

      return ctx.json(client, { status: 201 });
    },
  )
  // --------------------------------
  // GET /clients/:id/connections
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["clients"],
      method: "get",
      path: "/{id}/connections",
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
          Bearer: ["read:clients", "auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: clientConnectionsResponseSchema,
            },
          },
          description: "List of connections enabled for this client",
        },
      },
    }),
    async (ctx) => {
      const tenant_id = ctx.var.tenant_id;
      const { id } = ctx.req.valid("param");

      const client = await ctx.env.data.clients.get(tenant_id, id);

      if (!client) {
        throw new HTTPException(404, { message: "Client not found" });
      }

      // If no connections are defined, return all available connections
      const hasDefinedConnections =
        client.connections && client.connections.length > 0;

      let enabledConnections: Array<{
        connection_id: string;
        connection?: (typeof connectionSchema)["_output"];
      }>;

      if (hasDefinedConnections) {
        // Fetch full connection details for each enabled connection
        enabledConnections = await Promise.all(
          client.connections!.map(async (connectionId) => {
            const connection = await ctx.env.data.connections.get(
              tenant_id,
              connectionId,
            );
            return {
              connection_id: connectionId,
              connection: connection || undefined,
            };
          }),
        );
      } else {
        // No connections defined - return all available connections
        const { connections: allConnections } =
          await ctx.env.data.connections.list(tenant_id, {});
        enabledConnections = allConnections
          .filter((connection) => connection.id)
          .map((connection) => ({
            connection_id: connection.id!,
            connection,
          }));
      }

      return ctx.json({ enabled_connections: enabledConnections });
    },
  )
  // --------------------------------
  // PATCH /clients/:id/connections
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["clients"],
      method: "patch",
      path: "/{id}/connections",
      request: {
        body: {
          content: {
            "application/json": {
              schema: updateClientConnectionsSchema,
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
          Bearer: ["update:clients", "auth:write"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: clientConnectionsResponseSchema,
            },
          },
          description: "Updated list of connections for this client",
        },
      },
    }),
    async (ctx) => {
      const tenant_id = ctx.var.tenant_id;
      const { id } = ctx.req.valid("param");
      const connectionIds = ctx.req.valid("json");

      const client = await ctx.env.data.clients.get(tenant_id, id);

      if (!client) {
        throw new HTTPException(404, { message: "Client not found" });
      }

      // Validate all connection IDs exist and filter out invalid ones
      const validConnectionIds: string[] = [];
      for (const connectionId of connectionIds) {
        const connection = await ctx.env.data.connections.get(
          tenant_id,
          connectionId,
        );
        if (connection) {
          validConnectionIds.push(connectionId);
        }
      }

      // Update the client with the new ordered connections array
      await ctx.env.data.clients.update(tenant_id, id, {
        connections: validConnectionIds,
      });

      // Fetch and return the updated connections
      const enabledConnections = await Promise.all(
        validConnectionIds.map(async (connectionId) => {
          const connection = await ctx.env.data.connections.get(
            tenant_id,
            connectionId,
          );
          return {
            connection_id: connectionId,
            connection: connection || undefined,
          };
        }),
      );

      return ctx.json({ enabled_connections: enabledConnections });
    },
  );
