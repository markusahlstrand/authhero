import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { promptSettingSchema } from "@authhero/adapter-interfaces";

export const promptsRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /api/v2/propmpts
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["prompts"],
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
              schema: promptSettingSchema,
            },
          },
          description: "Branding settings",
        },
      },
    }),
    async (ctx) => {
      const promptSetting = await ctx.env.data.promptSettings.get(
        ctx.var.tenant_id,
      );

      if (!promptSetting) {
        // Returns the default values
        return ctx.json(promptSettingSchema.parse({}));
      }

      return ctx.json(promptSetting);
    },
  )
  // --------------------------------
  // PATCH /api/v2/prompts
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["prompts"],
      method: "patch",
      path: "/",
      request: {
        headers: z.object({
          "tenant-id": z.string(),
        }),
        body: {
          content: {
            "application/json": {
              schema: z.object(promptSettingSchema.shape).partial(),
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
          description: "Prompts settings",
        },
      },
    }),
    async (ctx) => {
      const promptSettings = ctx.req.valid("json");

      const updatedPromptSettings = await ctx.env.data.promptSettings.get(
        ctx.var.tenant_id,
      );

      Object.assign(updatedPromptSettings, promptSettings);

      await ctx.env.data.promptSettings.set(
        ctx.var.tenant_id,
        updatedPromptSettings,
      );

      return ctx.json(updatedPromptSettings);
    },
  );
