import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings } from "../../types";
import { HTTPException } from "hono/http-exception";
import { querySchema } from "../../types";
// import authenticationMiddleware from "../../middlewares/authentication";
import {
  connectionInsertSchema,
  connectionSchema,
  totalsSchema,
} from "@authhero/adapter-interfaces";
import { parseSort } from "../../helpers/sort";

const connectionsWithTotalsSchema = totalsSchema.extend({
  connections: z.array(connectionSchema),
});

export const connectionRoutes = new OpenAPIHono<{ Bindings: Bindings }>()
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
      // middleware: [authenticationMiddleware({ scopes: ["auth:read"] })],
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
      const { "tenant-id": tenant_id } = ctx.req.valid("header");

      const {
        page,
        per_page,
        include_totals = false,
        sort,
        q,
      } = ctx.req.valid("query");

      const result = await ctx.env.data.connections.list(tenant_id, {
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
      // middleware: [authenticationMiddleware({ scopes: ["auth:read"] })],
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
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id } = ctx.req.valid("param");

      const connection = await ctx.env.data.connections.get(tenant_id, id);

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
      // middleware: [authenticationMiddleware({ scopes: ["auth:write"] })],
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
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id } = ctx.req.valid("param");

      const result = await ctx.env.data.connections.remove(tenant_id, id);
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
      // middleware: [authenticationMiddleware({ scopes: ["auth:write"] })],
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
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id } = ctx.req.valid("param");
      const body = ctx.req.valid("json");

      const result = await ctx.env.data.connections.update(tenant_id, id, body);
      if (!result) {
        throw new HTTPException(404, {
          message: "Connection not found",
        });
      }

      const connection = await ctx.env.data.connections.get(tenant_id, id);

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
      // middleware: [authenticationMiddleware({ scopes: ["auth:write"] })],
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
          description: "An connection",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const body = ctx.req.valid("json");

      const connection = await ctx.env.data.connections.create(tenant_id, body);

      return ctx.json(connection, { status: 201 });
    },
  );
