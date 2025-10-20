import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { Bindings, Variables } from "../../types";
import { querySchema } from "../../types";
import { parseSort } from "../../utils/sort";
import {
  tenantInsertSchema,
  tenantSchema,
  totalsSchema,
} from "@authhero/adapter-interfaces";
import { deepMergePatch } from "../../utils/deep-merge";

const tenantsWithTotalsSchema = totalsSchema.extend({
  tenants: z.array(tenantSchema),
});

export const tenantRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /api/v2/tenants/settings - Get current tenant (from header/subdomain)
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["tenants", "settings"],
      method: "get",
      path: "/settings",
      request: {
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
              schema: tenantSchema,
            },
          },
          description: "Current tenant settings",
        },
      },
    }),
    async (ctx) => {
      const tenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);

      if (!tenant) {
        throw new HTTPException(404, {
          message: "Tenant not found",
        });
      }

      return ctx.json(tenant);
    },
  )
  // --------------------------------
  // PATCH /api/v2/tenants/settings - Update current tenant (from header/subdomain)
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["tenants", "settings"],
      method: "patch",
      path: "/settings",
      request: {
        headers: z.object({
          "tenant-id": z.string(),
        }),
        body: {
          content: {
            "application/json": {
              schema: z.object(tenantInsertSchema.shape).partial(),
            },
          },
        },
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
              schema: tenantSchema,
            },
          },
          description: "Updated tenant settings",
        },
      },
    }),
    async (ctx) => {
      const updates = ctx.req.valid("json");

      // Strip protected system fields that should not be modified
      const { id, ...sanitizedUpdates } = updates;

      // Get existing tenant
      const existingTenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);

      if (!existingTenant) {
        throw new HTTPException(404, {
          message: "Tenant not found",
        });
      }

      // Deep merge with updates to preserve nested object properties
      // Note: created_at and updated_at are not in the update payload, they're only in the full tenant schema
      const mergedTenant = deepMergePatch(existingTenant, sanitizedUpdates);

      await ctx.env.data.tenants.update(ctx.var.tenant_id, mergedTenant);

      // Return the updated tenant
      const updatedTenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);

      if (!updatedTenant) {
        throw new HTTPException(500, {
          message: "Failed to retrieve updated tenant",
        });
      }

      return ctx.json(updatedTenant);
    },
  )
  // --------------------------------
  // GET /tenants - List all tenants (admin only)
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["tenants"],
      method: "get",
      path: "/",
      request: {
        query: querySchema,
      },

      security: [
        {
          Bearer: ["auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "tenant/json": {
              schema: z.union([z.array(tenantSchema), tenantsWithTotalsSchema]),
            },
          },
          description: "List of tenants",
        },
      },
    }),
    async (ctx) => {
      const { page, per_page, include_totals, sort, q } =
        ctx.req.valid("query");

      const result = await ctx.env.data.tenants.list({
        page,
        per_page,
        include_totals,
        sort: parseSort(sort),
        q,
      });

      if (include_totals) {
        return ctx.json(result);
      }

      return ctx.json(result.tenants);
    },
  )
  // --------------------------------
  // GET /tenants/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["tenants"],
      method: "get",
      path: "/{id}",
      request: {
        params: z.object({
          id: z.string(),
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
            "tenant/json": {
              schema: tenantSchema,
            },
          },
          description: "A tenant",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");

      const tenant = await ctx.env.data.tenants.get(id);

      if (!tenant) {
        throw new HTTPException(404);
      }

      return ctx.json(tenant);
    },
  )
  // --------------------------------
  // DELETE /tenants/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["tenants"],
      method: "delete",
      path: "/{id}",
      request: {
        params: z.object({
          id: z.string(),
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

      await ctx.env.data.tenants.remove(id);

      return ctx.text("OK");
    },
  )
  // --------------------------------
  // PATCH /tenants/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["tenants"],
      method: "patch",
      path: "/{id}",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object(tenantInsertSchema.shape).partial(),
            },
          },
        },
        params: z.object({
          id: z.string(),
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
      const body = ctx.req.valid("json");

      await ctx.env.data.tenants.update(id, body);

      return ctx.text("OK");
    },
  )
  // --------------------------------
  // POST /tenants
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["tenants"],
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object(tenantInsertSchema.shape),
            },
          },
        },
      },
      security: [
        {
          Bearer: ["auth:write"],
        },
      ],
      responses: {
        201: {
          content: {
            "tenant/json": {
              schema: tenantSchema,
            },
          },
          description: "An tenant",
        },
      },
    }),
    async (ctx) => {
      const body = ctx.req.valid("json");

      const tenant = await ctx.env.data.tenants.create(body);

      return ctx.json(tenant, { status: 201 });
    },
  );
