import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { tenantSettingsSchema } from "@authhero/adapter-interfaces";
import { deepMergePatch } from "../../utils/deep-merge";

export const settingsRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /api/v2/tenants/settings
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["settings"],
      method: "get",
      path: "/",
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
              schema: tenantSettingsSchema,
            },
          },
          description: "Tenant settings",
        },
      },
    }),
    async (ctx) => {
      const settings = await ctx.env.data.tenantSettings.get(ctx.var.tenant_id);

      if (!settings) {
        // Return empty object if no settings exist yet
        return ctx.json({});
      }

      return ctx.json(settings);
    },
  )
  // --------------------------------
  // PATCH /api/v2/tenants/settings
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["settings"],
      method: "patch",
      path: "/",
      request: {
        headers: z.object({
          "tenant-id": z.string(),
        }),
        body: {
          content: {
            "application/json": {
              schema: z.object(tenantSettingsSchema.shape).partial(),
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
              schema: tenantSettingsSchema,
            },
          },
          description: "Updated tenant settings",
        },
      },
    }),
    async (ctx) => {
      const updates = ctx.req.valid("json");

      // Get existing settings
      const existingSettings = await ctx.env.data.tenantSettings.get(
        ctx.var.tenant_id,
      );

      // Deep merge with updates to preserve nested object properties
      const mergedSettings = deepMergePatch(existingSettings || {}, updates);

      await ctx.env.data.tenantSettings.set(ctx.var.tenant_id, mergedSettings);

      return ctx.json(mergedSettings);
    },
  );
