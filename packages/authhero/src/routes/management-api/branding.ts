import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { brandingSchema } from "@authhero/adapter-interfaces";
import { themesRoutes } from "./themes";
import { DEFAULT_BRANDING } from "../../constants/defaultBranding";

export const brandingRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /api/v2/branding
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["branding"],
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
              schema: brandingSchema,
            },
          },
          description: "Branding settings",
        },
      },
    }),
    async (ctx) => {
      const branding = await ctx.env.data.branding.get(ctx.var.tenant_id);

      if (!branding) {
        return ctx.json(DEFAULT_BRANDING);
      }

      return ctx.json(branding);
    },
  )
  // --------------------------------
  // PATCH /api/v2/branding
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["branding"],
      method: "patch",
      path: "/",
      request: {
        headers: z.object({
          "tenant-id": z.string(),
        }),
        body: {
          content: {
            "application/json": {
              schema: z.object(brandingSchema.shape).partial(),
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
          description: "Branding settings",
        },
      },
    }),
    async (ctx) => {
      const branding = ctx.req.valid("json");

      await ctx.env.data.branding.set(ctx.var.tenant_id, branding);

      return ctx.text("OK");
    },
  )
  // --------------------------------
  // Themes sub-routes
  // --------------------------------
  .route("/themes", themesRoutes);
