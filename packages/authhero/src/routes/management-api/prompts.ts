import { Bindings } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
// import authenticationMiddleware from "../../middlewares/authentication";
import { promptSettingSchema } from "@authhero/adapter-interfaces";

export const promptsRoutes = new OpenAPIHono<{ Bindings: Bindings }>()
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
      // middleware: [authenticationMiddleware({ scopes: ["auth:read"] })],
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
      const { "tenant-id": tenant_id } = ctx.req.valid("header");

      const promptSetting = await ctx.env.data.promptSettings.get(tenant_id);

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
      // middleware: [authenticationMiddleware({ scopes: ["auth:write"] })],
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
      const { "tenant-id": tenant_id } = ctx.req.valid("header");

      const promptSettings = ctx.req.valid("json");

      const updatedPromptSettings =
        await ctx.env.data.promptSettings.get(tenant_id);

      Object.assign(updatedPromptSettings, promptSettings);

      await ctx.env.data.promptSettings.set(tenant_id, updatedPromptSettings);

      return ctx.json(updatedPromptSettings);
    },
  );
