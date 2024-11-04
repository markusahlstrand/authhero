import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  applicationSchema,
  applicationInsertSchema,
  totalsSchema,
} from "@authhero/adapter-interfaces";
// import { headers } from "../../constants";
import { Bindings } from "../../types";
import { HTTPException } from "hono/http-exception";
import { nanoid } from "nanoid";
import { auth0QuerySchema } from "../../types/auth0/Query";
import { parseSort } from "../../helpers/sort";
// import authenticationMiddleware from "../../middlewares/authentication";

const applicationWithTotalsSchema = totalsSchema.extend({
  clients: z.array(applicationSchema),
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
        query: auth0QuerySchema,
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
                applicationWithTotalsSchema,
                z.array(applicationSchema),
              ]),
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

      const result = await ctx.env.data.applications.list(tenant_id, {
        page,
        per_page,
        include_totals,
        sort: parseSort(sort),
        q,
      });

      const clients = result.applications;

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
              schema: applicationSchema,
            },
          },
          description: "An application",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id } = ctx.req.valid("param");

      // Workaround until the adapter is fixed
      // const application = await ctx.env.data.clients.get(tenant_id, id);
      const clients = await ctx.env.data.applications.list(tenant_id, {
        page: 1,
        per_page: 0,
        include_totals: false,
      });
      const application = clients.applications.find((a) => a.id === id);

      if (!application) {
        throw new HTTPException(404);
      }

      return ctx.json(application, {
        // headers,
      });
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

      const result = await ctx.env.data.applications.remove(tenant_id, id);
      if (!result) {
        throw new HTTPException(404, { message: "Application not found" });
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
              schema: z.object(applicationInsertSchema.shape).partial(),
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
              schema: applicationSchema,
            },
          },
          description: "The update application",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id } = ctx.req.valid("param");
      const body = ctx.req.valid("json");

      const applicationUpdate = body;

      await ctx.env.data.applications.update(tenant_id, id, applicationUpdate);
      const application = await ctx.env.data.applications.get(tenant_id, id);

      if (!application) {
        throw new HTTPException(404, { message: "Application not found" });
      }

      return ctx.json(application);
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
              schema: z.object(applicationInsertSchema.shape),
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
              schema: z.object(applicationSchema.shape),
            },
          },
          description: "An application",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const body = ctx.req.valid("json");

      const applicationUpdate = {
        ...body,
        id: body.id || nanoid(),
        client_secret: body.client_secret || nanoid(),
      };

      const application = await ctx.env.data.applications.create(
        tenant_id,
        applicationUpdate,
      );

      return ctx.json(application, { status: 201 });
    },
  );
