import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { Bindings, Variables } from "../../types";
import { tenantInsertSchema, tenantSchema } from "@authhero/adapter-interfaces";
import { deepMergePatch } from "../../utils/deep-merge";

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
          "tenant-id": z.string().optional(),
        }),
      },
      security: [
        {
          Bearer: ["read:tenants", "auth:read"],
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
          "tenant-id": z.string().optional(),
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
          Bearer: ["update:tenants", "auth:write"],
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
  );
