import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  clientSchema,
  clientInsertSchema,
  totalsSchema,
} from "@authhero/adapter-interfaces";
import { Bindings } from "../../types";
import { HTTPException } from "hono/http-exception";
import { nanoid } from "nanoid";
import { querySchema } from "../../types/auth0/Query";
import { parseSort } from "../../utils/sort";

const clientWithTotalsSchema = totalsSchema.extend({
  clients: z.array(clientSchema),
});

export const clientRoutes = new OpenAPIHono<{ Bindings: Bindings }>()
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
              schema: z.union([clientWithTotalsSchema, z.array(clientSchema)]),
            },
          },
          description: "List of clients",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
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
              schema: clientSchema,
            },
          },
          description: "A client",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
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
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
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
              schema: clientSchema,
            },
          },
          description: "The updated client",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
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
              schema: z.object(clientSchema.shape),
            },
          },
          description: "A client",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const body = ctx.req.valid("json");

      const clientCreate = {
        ...body,
        client_secret: body.client_secret || nanoid(),
      };

      const client = await ctx.env.data.clients.create(tenant_id, clientCreate);

      return ctx.json(client, { status: 201 });
    },
  );
