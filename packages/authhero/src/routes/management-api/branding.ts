import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { brandingSchema, LogTypes } from "@authhero/adapter-interfaces";
import { logMessage } from "../../helpers/logging";
import { themesRoutes } from "./themes";
import { DEFAULT_BRANDING } from "../../constants/defaultBranding";
import {
  DEFAULT_UNIVERSAL_LOGIN_TEMPLATE,
  REQUIRED_SLOT,
} from "../universal-login/universal-login-template";
import { HTTPException } from "hono/http-exception";

import { defineRoute } from "../../utils/define-route";
const universalLoginTemplateSchema = z.object({
  body: z.string(),
});
const getRoot = defineRoute({
  route: createRoute({
      tags: ["branding"],
      method: "get",
      path: "/",
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
              schema: brandingSchema,
            },
          },
          description: "Branding settings",
        },
      },
    }),
  handler: async (ctx) => {
      const branding = await ctx.env.data.branding.get(ctx.var.tenant_id);

      if (!branding) {
        return ctx.json(DEFAULT_BRANDING);
      }

      return ctx.json(branding);
    },
});

const patchRoot = defineRoute({
  route: createRoute({
      tags: ["branding"],
      method: "patch",
      path: "/",
      request: {
        headers: z.object({
          "tenant-id": z.string().optional(),
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
          Bearer: ["update:branding"],
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
  handler: async (ctx) => {
      const branding = ctx.req.valid("json");

      await ctx.env.data.branding.set(ctx.var.tenant_id, branding);

      // Return the updated branding (like Auth0 does)
      const updatedBranding = await ctx.env.data.branding.get(
        ctx.var.tenant_id,
      );

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Update Branding",
        targetType: "branding",
        targetId: ctx.var.tenant_id,
      });

      return ctx.json(updatedBranding || DEFAULT_BRANDING);
    },
});

const getTemplatesUniversalLogin = defineRoute({
  route: createRoute({
      tags: ["branding"],
      method: "get",
      path: "/templates/universal-login",
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
              schema: universalLoginTemplateSchema,
            },
          },
          description:
            "Universal login template — tenant-customized when one is stored, otherwise the AuthHero default body that tenants can copy and modify.",
        },
      },
    }),
  handler: async (ctx) => {
      const template = await ctx.env.data.universalLoginTemplates.get(
        ctx.var.tenant_id,
      );

      if (template) {
        return ctx.json(template);
      }

      return ctx.json({ body: DEFAULT_UNIVERSAL_LOGIN_TEMPLATE });
    },
});

const putTemplatesUniversalLogin = defineRoute({
  route: createRoute({
      tags: ["branding"],
      method: "put",
      path: "/templates/universal-login",
      request: {
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
        body: {
          content: {
            "application/json": {
              schema: universalLoginTemplateSchema,
            },
          },
        },
      },
      security: [
        {
          Bearer: ["update:branding"],
        },
      ],
      responses: {
        204: {
          description: "Template updated successfully",
        },
        400: {
          description: "Invalid template",
        },
      },
    }),
  handler: async (ctx) => {
      const template = ctx.req.valid("json");

      // Body must mount the widget. Chip slots are optional — omitting one
      // hides that pill.
      if (!template.body.includes(REQUIRED_SLOT)) {
        throw new HTTPException(400, {
          message: `Template must contain ${REQUIRED_SLOT} tag`,
        });
      }

      await ctx.env.data.universalLoginTemplates.set(
        ctx.var.tenant_id,
        template,
      );

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Set Universal Login Template",
        targetType: "universal_login_template",
        targetId: ctx.var.tenant_id,
      });

      return ctx.body(null, 204);
    },
});

const deleteTemplatesUniversalLogin = defineRoute({
  route: createRoute({
      tags: ["branding"],
      method: "delete",
      path: "/templates/universal-login",
      request: {
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
      },
      security: [
        {
          Bearer: ["delete:branding"],
        },
      ],
      responses: {
        204: {
          description: "Template deleted successfully",
        },
      },
    }),
  handler: async (ctx) => {
      await ctx.env.data.universalLoginTemplates.delete(ctx.var.tenant_id);

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Delete Universal Login Template",
        targetType: "universal_login_template",
        targetId: ctx.var.tenant_id,
      });

      return ctx.body(null, 204);
    },
});


export const brandingRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  .openapiRoutes([getRoot, patchRoot, getTemplatesUniversalLogin, putTemplatesUniversalLogin, deleteTemplatesUniversalLogin] as const)
  .route("/themes", themesRoutes);
