import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { themeSchema, LogTypes } from "@authhero/adapter-interfaces";
import { DEFAULT_THEME } from "../../constants/defaultTheme";
import { deepMergePatch } from "../../utils/deep-merge";
import { logMessage } from "../../helpers/logging";

import { defineRoute } from "../../utils/define-route";
// Zod 4 removed `.deepPartial()` (the API was unsound in several edge cases).
// PATCH /branding/themes/default accepts an arbitrary subset of the theme
// tree, so we recursively wrap each nested object in `.partial()`. Runtime
// behavior matches Zod 3's `themeSchema.deepPartial()`.
//
// The output is typed back to the input schema so downstream `valid("json")`
// inference produces the right shape — without this, the validated body
// would resolve to `unknown` and callers couldn't index it.
function deepPartialRuntime(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodObject) {
    const newShape: Record<string, z.ZodTypeAny> = {};
    for (const [key, value] of Object.entries(schema.shape)) {
      newShape[key] = deepPartialRuntime(value as z.ZodTypeAny).optional();
    }
    return z.object(newShape);
  }
  return schema;
}
function deepPartial<T extends z.ZodTypeAny>(schema: T): T {
  return deepPartialRuntime(schema) as unknown as T;
}
const getDefault = defineRoute({
  route: createRoute({
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
        Bearer: ["read:branding"],
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
  handler: async (ctx) => {
    const theme = await ctx.env.data.themes.get(ctx.var.tenant_id, "default");

    if (!theme) {
      return ctx.json(DEFAULT_THEME);
    }

    return ctx.json(theme);
  },
});

const patchDefault = defineRoute({
  route: createRoute({
    tags: ["branding"],
    method: "patch",
    path: "/default",
    request: {
      body: {
        content: {
          "application/json": {
            schema: deepPartial(themeSchema),
          },
        },
      },
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
    },
    security: [
      {
        Bearer: ["update:branding"],
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
  handler: async (ctx) => {
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

    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Update Theme",
      targetType: "theme",
      targetId: "default",
      ...(existingTheme
        ? { beforeState: existingTheme as Record<string, unknown> }
        : {}),
      afterState: mergedTheme as Record<string, unknown>,
    });

    // Return the merged theme (what we just saved)
    return ctx.json({ ...mergedTheme, themeId: "default" });
  },
});

export const themesRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([getDefault, patchDefault] as const);
