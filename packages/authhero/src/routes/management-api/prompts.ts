import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  promptSettingSchema,
  promptScreenSchema,
  customTextSchema,
} from "@authhero/adapter-interfaces";

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
          "tenant-id": z.string().optional(),
        }),
      },

      security: [
        {
          Bearer: ["read:prompts", "auth:read"],
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
          "tenant-id": z.string().optional(),
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
          Bearer: ["update:prompts", "auth:write"],
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
  )
  // --------------------------------
  // GET /api/v2/prompts/custom-text
  // List all custom text entries for a tenant
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["prompts"],
      method: "get",
      path: "/custom-text",
      request: {
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
      },
      security: [
        {
          Bearer: ["read:prompts", "auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.array(
                z.object({
                  prompt: promptScreenSchema,
                  language: z.string(),
                }),
              ),
            },
          },
          description: "List of custom text entries",
        },
      },
    }),
    async (ctx) => {
      const entries = await ctx.env.data.customText.list(ctx.var.tenant_id);
      return ctx.json(entries);
    },
  )
  // --------------------------------
  // GET /api/v2/prompts/:prompt/custom-text/:language
  // Get custom text for a specific prompt and language
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["prompts"],
      method: "get",
      path: "/{prompt}/custom-text/{language}",
      request: {
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
        params: z.object({
          prompt: promptScreenSchema,
          language: z.string(),
        }),
      },
      security: [
        {
          Bearer: ["read:prompts", "auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: customTextSchema,
            },
          },
          description: "Custom text for the prompt and language",
        },
      },
    }),
    async (ctx) => {
      const { prompt, language } = ctx.req.valid("param");
      const customText = await ctx.env.data.customText.get(
        ctx.var.tenant_id,
        prompt,
        language,
      );

      return ctx.json(customText || {});
    },
  )
  // --------------------------------
  // PUT /api/v2/prompts/:prompt/custom-text/:language
  // Set custom text for a specific prompt and language
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["prompts"],
      method: "put",
      path: "/{prompt}/custom-text/{language}",
      request: {
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
        params: z.object({
          prompt: promptScreenSchema,
          language: z.string(),
        }),
        body: {
          content: {
            "application/json": {
              schema: customTextSchema,
            },
          },
        },
      },
      security: [
        {
          Bearer: ["update:prompts", "auth:write"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: customTextSchema,
            },
          },
          description: "Updated custom text",
        },
      },
    }),
    async (ctx) => {
      const { prompt, language } = ctx.req.valid("param");
      const customText = customTextSchema.parse(await ctx.req.json());

      await ctx.env.data.customText.set(
        ctx.var.tenant_id,
        prompt,
        language,
        customText,
      );

      return ctx.json(customText);
    },
  )
  // --------------------------------
  // DELETE /api/v2/prompts/:prompt/custom-text/:language
  // Delete custom text for a specific prompt and language
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["prompts"],
      method: "delete",
      path: "/{prompt}/custom-text/{language}",
      request: {
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
        params: z.object({
          prompt: promptScreenSchema,
          language: z.string(),
        }),
      },
      security: [
        {
          Bearer: ["delete:prompts", "auth:write"],
        },
      ],
      responses: {
        204: {
          description: "Custom text deleted",
        },
      },
    }),
    async (ctx) => {
      const { prompt, language } = ctx.req.valid("param");

      await ctx.env.data.customText.delete(ctx.var.tenant_id, prompt, language);

      return ctx.body(null, 204);
    },
  );
