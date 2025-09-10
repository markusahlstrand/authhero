import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  organizationSchema,
  organizationInsertSchema,
  totalsSchema,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { HTTPException } from "hono/http-exception";
import { nanoid } from "nanoid";
import { querySchema } from "../../types/auth0/Query";
import { parseSort } from "../../utils/sort";

const organizationsWithTotalsSchema = totalsSchema.extend({
  organizations: z.array(organizationSchema),
});

export const organizationRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /api/v2/organizations
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["organizations"],
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
                organizationsWithTotalsSchema,
                z.array(organizationSchema),
              ]),
            },
          },
          description: "List of organizations",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { page, per_page, include_totals, sort, q } =
        ctx.req.valid("query");

      const result = await ctx.env.data.organizations.list(tenant_id, {
        page,
        per_page,
        include_totals,
        sort: parseSort(sort),
        q,
      });

      if (include_totals) {
        return ctx.json(result);
      }

      return ctx.json(result.organizations);
    },
  )
  // --------------------------------
  // GET /api/v2/organizations/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["organizations"],
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
              schema: organizationSchema,
            },
          },
          description: "An organization",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id } = ctx.req.valid("param");

      const organization = await ctx.env.data.organizations.get(tenant_id, id);

      if (!organization) {
        throw new HTTPException(404, { message: "Organization not found" });
      }

      return ctx.json(organization);
    },
  )
  // --------------------------------
  // DELETE /api/v2/organizations/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["organizations"],
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
          description: "Organization deleted successfully",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id } = ctx.req.valid("param");

      const result = await ctx.env.data.organizations.remove(tenant_id, id);
      if (!result) {
        throw new HTTPException(404, { message: "Organization not found" });
      }

      return ctx.text("OK");
    },
  )
  // --------------------------------
  // PATCH /api/v2/organizations/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["organizations"],
      method: "patch",
      path: "/{id}",
      request: {
        body: {
          content: {
            "application/json": {
              schema: organizationInsertSchema.partial(),
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
              schema: organizationSchema,
            },
          },
          description: "The updated organization",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id } = ctx.req.valid("param");
      const body = ctx.req.valid("json");

      const updated = await ctx.env.data.organizations.update(
        tenant_id,
        id,
        body,
      );

      if (!updated) {
        throw new HTTPException(404, { message: "Organization not found" });
      }

      const organization = await ctx.env.data.organizations.get(tenant_id, id);

      if (!organization) {
        throw new HTTPException(404, { message: "Organization not found" });
      }

      return ctx.json(organization);
    },
  )
  // --------------------------------
  // POST /api/v2/organizations
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["organizations"],
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": {
              schema: organizationInsertSchema,
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
              schema: organizationSchema,
            },
          },
          description: "The created organization",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const body = ctx.req.valid("json");

      const organizationData = {
        ...body,
        id: body.id || nanoid(),
      };

      const organization = await ctx.env.data.organizations.create(
        tenant_id,
        organizationData,
      );

      return ctx.json(organization, { status: 201 });
    },
  );
