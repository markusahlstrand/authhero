import { Bindings } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { themeSchema } from "@authhero/adapter-interfaces";
import { DEFAULT_THEME } from "../../constants/defaultTheme";
import { deepMergePatch } from "../../utils/deep-merge";

export const themesRoutes = new OpenAPIHono<{ Bindings: Bindings }>()
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
              schema: themeSchema,
            },
          },
          description: "Default theme settings",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");

      const theme = await ctx.env.data.themes.get(tenant_id, "default");

      if (!theme) {
        return ctx.json(DEFAULT_THEME);
      }

      return ctx.json(theme);
    },
  )
  // --------------------------------
  // PUT /api/v2/branding/themes/default
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["branding"],
      method: "put",
      path: "/default",
      request: {
        headers: z.object({
          "tenant-id": z.string(),
        }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                displayName: z.string().optional(),
                colors: z.record(z.string()).optional(),
                borders: z
                  .record(z.union([z.string(), z.number(), z.boolean()]))
                  .optional(),
                fonts: z.record(z.any()).optional(),
                page_background: z.record(z.any()).optional(),
                widget: z.record(z.any()).optional(),
              }),
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
              schema: themeSchema,
            },
          },
          description: "Updated theme settings",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const themeData = ctx.req.valid("json");

      // Get existing theme or use default
      const existingTheme = await ctx.env.data.themes.get(tenant_id, "default");

      if (existingTheme) {
        // Deep merge the partial update with existing theme
        const updatedTheme = deepMergePatch(existingTheme, themeData);

        await ctx.env.data.themes.update(tenant_id, "default", updatedTheme);
        const result = await ctx.env.data.themes.get(tenant_id, "default");
        return ctx.json(result!);
      } else {
        // Create new theme with default values merged with provided data
        const newTheme = deepMergePatch(DEFAULT_THEME, themeData);

        const createdTheme = await ctx.env.data.themes.create(
          tenant_id,
          newTheme,
        );
        return ctx.json(createdTheme);
      }
    },
  );
