import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { themeSchema } from "@authhero/adapter-interfaces";
import { DEFAULT_THEME } from "../../constants/defaultTheme";
import { deepMergePatch } from "../../utils/deep-merge";

export const themesRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /api/v2/branding/themes/default
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["branding"],
      method: "get",
      path: "/default",
      request: {
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
      },
      security: [
        {
          Bearer: ["read:branding", "auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: themeSchema,
            },
          },
          description: "Default theme settings",
        },
      },
    }),
    async (ctx) => {
      const theme = await ctx.env.data.themes.get(ctx.var.tenant_id, "default");

      if (!theme) {
        return ctx.json(DEFAULT_THEME);
      }

      return ctx.json(theme);
    },
  )
  // --------------------------------
  // PATCH /api/v2/branding/themes/default
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["branding"],
      method: "patch",
      path: "/default",
      request: {
        body: {
          content: {
            "application/json": {
              schema: themeSchema.deepPartial(),
            },
          },
        },
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
      },
      security: [
        {
          Bearer: ["update:branding", "auth:write"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: themeSchema,
            },
          },
          description: "Updated theme settings",
        },
      },
    }),
    async (ctx) => {
      const themeData = ctx.req.valid("json");

      // Get existing theme from database
      const existingTheme = await ctx.env.data.themes.get(
        ctx.var.tenant_id,
        "default",
      );

      // Always merge with DEFAULT_THEME to ensure all required fields exist
      const baseTheme = existingTheme || DEFAULT_THEME;
      const mergedTheme = deepMergePatch(baseTheme, themeData);

      if (existingTheme) {
        // Update existing theme
        await ctx.env.data.themes.update(
          ctx.var.tenant_id,
          "default",
          mergedTheme,
        );
      } else {
        // Create new theme
        await ctx.env.data.themes.create(
          ctx.var.tenant_id,
          mergedTheme,
          "default",
        );
      }

      // Return the merged theme (what we just saved)
      return ctx.json({ ...mergedTheme, themeId: "default" });
    },
  );
