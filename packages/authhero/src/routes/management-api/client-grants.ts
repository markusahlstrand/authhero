import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings } from "../../types";
import { HTTPException } from "hono/http-exception";
import { querySchema } from "../../types";
import {
  clientGrantInsertSchema,
  clientGrantSchema,
  totalsSchema,
} from "@authhero/adapter-interfaces";
import { parseSort } from "../../utils/sort";

const clientGrantsWithTotalsSchema = totalsSchema.extend({
  client_grants: z.array(clientGrantSchema),
});

export const clientGrantRoutes = new OpenAPIHono<{ Bindings: Bindings }>()
  // --------------------------------
  // GET /api/v2/client-grants
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["client-grants"],
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
                z.array(clientGrantSchema),
                clientGrantsWithTotalsSchema,
              ]),
            },
          },
          description: "List of client grants",
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

      const result = await ctx.env.data.clientGrants.list(tenant_id, {
        page,
        per_page,
        include_totals,
        sort: parseSort(sort),
        q,
      });

      if (!include_totals) {
        return ctx.json(result.client_grants);
      }

      return ctx.json(result);
    },
  )
  // --------------------------------
  // GET /api/v2/client-grants/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["client-grants"],
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
              schema: clientGrantSchema,
            },
          },
          description: "A client grant",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id } = ctx.req.valid("param");

      const clientGrant = await ctx.env.data.clientGrants.get(tenant_id, id);

      if (!clientGrant) {
        throw new HTTPException(404, {
          message: "Client grant not found",
        });
      }

      return ctx.json(clientGrant);
    },
  )
  // --------------------------------
  // DELETE /api/v2/client-grants/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["client-grants"],
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

      const result = await ctx.env.data.clientGrants.remove(tenant_id, id);
      if (!result) {
        throw new HTTPException(404, {
          message: "Client grant not found",
        });
      }

      return ctx.text("OK");
    },
  )
  // --------------------------------
  // PATCH /api/v2/client-grants/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["client-grants"],
      method: "patch",
      path: "/{id}",
      request: {
        params: z.object({
          id: z.string(),
        }),
        body: {
          content: {
            "application/json": {
              schema: z.object(clientGrantInsertSchema.shape).partial(),
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
        200: {
          content: {
            "application/json": {
              schema: clientGrantSchema,
            },
          },
          description: "The updated client grant",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id } = ctx.req.valid("param");
      const body = ctx.req.valid("json");

      const exists = await ctx.env.data.clientGrants.get(tenant_id, id);
      if (!exists) {
        throw new HTTPException(404, {
          message: "Client grant not found",
        });
      }

      const updated = await ctx.env.data.clientGrants.update(
        tenant_id,
        id,
        body,
      );

      if (!updated) {
        throw new HTTPException(500, {
          message: "Failed to update client grant",
        });
      }

      const clientGrant = await ctx.env.data.clientGrants.get(tenant_id, id);
      if (!clientGrant) {
        throw new HTTPException(404, {
          message: "Client grant not found",
        });
      }
      return ctx.json(clientGrant);
    },
  )
  // --------------------------------
  // POST /api/v2/client-grants
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["client-grants"],
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object(clientGrantInsertSchema.shape),
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
              schema: clientGrantSchema,
            },
          },
          description: "A client grant",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const body = ctx.req.valid("json");

      const clientGrant = await ctx.env.data.clientGrants.create(
        tenant_id,
        body,
      );

      return ctx.json(clientGrant, { status: 201 });
    },
  );
