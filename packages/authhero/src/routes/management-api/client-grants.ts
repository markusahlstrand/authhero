import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings } from "../../types";
import { HTTPException } from "hono/http-exception";
import {
  clientGrantInsertSchema,
  clientGrantSchema,
  totalsSchema,
} from "@authhero/adapter-interfaces";

// Auth0-compatible query schema for client grants
const clientGrantsQuerySchema = z.object({
  per_page: z
    .string()
    .min(1)
    .optional()
    .default("50")
    .transform((p) => parseInt(p, 10))
    .openapi({
      description: "Number of results per page. Defaults to 50.",
    }),
  page: z
    .string()
    .min(0)
    .optional()
    .default("0")
    .transform((p) => parseInt(p, 10))
    .openapi({
      description: "Page index of the results to return. First page is 0.",
    }),
  include_totals: z
    .string()
    .optional()
    .default("false")
    .transform((it) => it === "true")
    .openapi({
      description:
        "Return results inside an object that contains the total result count (true) or as a direct array of results (false, default).",
    }),
  from: z.string().optional().openapi({
    description: "Optional Id from which to start selection.",
  }),
  take: z
    .string()
    .min(1)
    .optional()
    .transform((p) => (p ? parseInt(p, 10) : undefined))
    .openapi({
      description: "Number of results per page. Defaults to 50.",
    }),
  audience: z.string().optional().openapi({
    description: "Optional filter on audience.",
  }),
  client_id: z.string().optional().openapi({
    description: "Optional filter on client_id.",
  }),
  allow_any_organization: z
    .string()
    .optional()
    .transform((val) =>
      val === "true" ? true : val === "false" ? false : undefined,
    )
    .openapi({
      description: "Optional filter on allow_any_organization.",
    }),
  subject_type: z.enum(["client", "user"]).optional().openapi({
    description:
      "EA The type of application access the client grant allows. Use of this field is subject to the applicable Free Trial terms in Okta's Master Subscription Agreement.",
  }),
});

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
        query: clientGrantsQuerySchema,
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
        from,
        take,
        audience,
        client_id,
        allow_any_organization,
        subject_type,
      } = ctx.req.valid("query");

      // Build lucene query from Auth0 parameters
      const queryParts: string[] = [];

      if (client_id) {
        queryParts.push(`client_id:"${client_id}"`);
      }

      if (audience) {
        queryParts.push(`audience:"${audience}"`);
      }

      if (allow_any_organization !== undefined) {
        queryParts.push(`allow_any_organization:${allow_any_organization}`);
      }

      if (subject_type) {
        queryParts.push(`subject_type:"${subject_type}"`);
      }

      if (from) {
        queryParts.push(`id:>${from}`);
      }

      const luceneQuery =
        queryParts.length > 0 ? queryParts.join(" AND ") : undefined;

      // Use take parameter if provided, otherwise use per_page
      const actualPerPage = take ?? per_page;

      const result = await ctx.env.data.clientGrants.list(tenant_id, {
        page,
        per_page: actualPerPage,
        include_totals,
        q: luceneQuery,
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
