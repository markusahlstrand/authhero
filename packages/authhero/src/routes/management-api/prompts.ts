import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  promptSettingSchema,
  promptScreenSchema,
  customTextSchema,
  LogTypes,
} from "@authhero/adapter-interfaces";
import { logMessage } from "../../helpers/logging";
import { getAllLocaleDefaults } from "../../i18n";

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
          Bearer: ["read:prompts"],
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
          Bearer: ["update:prompts"],
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

      const existing = await ctx.env.data.promptSettings.get(ctx.var.tenant_id);

      await ctx.env.data.promptSettings.set(ctx.var.tenant_id, {
        ...existing,
        ...promptSettings,
      });

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Update Prompt Settings",
        targetType: "prompt_settings",
        targetId: ctx.var.tenant_id,
      });

      return ctx.json(
        await ctx.env.data.promptSettings.get(ctx.var.tenant_id),
      );
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
          Bearer: ["read:prompts"],
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
  // GET /api/v2/prompts/custom-text/defaults
  // Return the bundled default text so the admin UI can render placeholders
  // and discover which prompt/screen/key forms exist. Auth0 has no equivalent.
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["prompts"],
      method: "get",
      path: "/custom-text/defaults",
      request: {
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
        query: z.object({
          language: z.string().optional(),
          prompt: z.string().optional(),
        }),
      },
      security: [
        {
          Bearer: ["read:prompts"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.array(
                z.object({
                  prompt: z.string(),
                  language: z.string(),
                  custom_text: customTextSchema,
                }),
              ),
            },
          },
          description:
            "Bundled default text for every prompt/language shipped with authhero. authhero extension; not available in Auth0.",
        },
      },
    }),
    async (ctx) => {
      const { language, prompt } = ctx.req.valid("query");
      return ctx.json(getAllLocaleDefaults({ language, prompt }));
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
          Bearer: ["read:prompts"],
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

      return ctx.json(customText ?? {});
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
          Bearer: ["update:prompts"],
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
      const body = await ctx.req.json();
      const customText = customTextSchema.parse(body);

      await ctx.env.data.customText.set(
        ctx.var.tenant_id,
        prompt,
        language,
        customText,
      );

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Set Custom Text",
        targetType: "custom_text",
        targetId: ctx.var.tenant_id,
      });

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
          Bearer: ["delete:prompts"],
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

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Delete Custom Text",
        targetType: "custom_text",
        targetId: ctx.var.tenant_id,
      });

      return ctx.body(null, 204);
    },
  );
