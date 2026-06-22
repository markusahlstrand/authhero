import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  brandingSchema,
  themeSchema,
  LogTypes,
} from "@authhero/adapter-interfaces";
import { logMessage } from "../../helpers/logging";
import { themesRoutes } from "./themes";
import { DEFAULT_BRANDING } from "../../constants/defaultBranding";
import {
  DEFAULT_UNIVERSAL_LOGIN_TEMPLATE,
  validateUniversalLoginTemplate,
} from "../universal-login/universal-login-template";
import {
  renderWidgetPageResponse,
  resolveDarkMode,
} from "../universal-login/u2-widget-page";
import { DEFAULT_THEME } from "../../constants/defaultTheme";
import { locales } from "../../i18n";
import { buildPreviewScreen, PREVIEW_SCREEN_IDS } from "./branding-preview";
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
    const updatedBranding = await ctx.env.data.branding.get(ctx.var.tenant_id);

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

    // Body must mount the widget and be valid Liquid. Chip slots are
    // optional — omitting one hides that pill.
    const validation = validateUniversalLoginTemplate(template.body);
    if (!validation.valid) {
      throw new HTTPException(400, {
        message: validation.error,
      });
    }

    await ctx.env.data.universalLoginTemplates.set(ctx.var.tenant_id, template);

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

const postTemplatesUniversalLoginPreview = defineRoute({
  route: createRoute({
    tags: ["branding"],
    method: "post",
    path: "/templates/universal-login/preview",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              // Render this template body instead of the stored one — lets the
              // admin preview unsaved edits. Falls back to the stored template,
              // then the default, when omitted.
              body: z.string().optional(),
              screen: z.enum(PREVIEW_SCREEN_IDS).optional(),
              // Optional live branding/theme overrides so the preview can
              // reflect unsaved form edits. Merged over the stored values.
              branding: z.object(brandingSchema.shape).partial().optional(),
              theme: z.object(themeSchema.shape).partial().optional(),
            }),
          },
        },
      },
    },
    security: [
      {
        Bearer: ["read:branding"],
      },
    ],
    responses: {
      200: {
        content: {
          "text/html": {
            schema: z.string(),
          },
        },
        description:
          "Full-page Universal Login preview rendered with the tenant's branding/theme and a sample screen.",
      },
    },
  }),
  handler: async (ctx) => {
    const {
      body,
      screen,
      branding: brandingOverride,
      theme: themeOverride,
    } = ctx.req.valid("json");
    const tenantId = ctx.var.tenant_id;

    const [branding, theme, storedTemplate] = await Promise.all([
      ctx.env.data.branding.get(tenantId),
      ctx.env.data.themes.get(tenantId, "default"),
      ctx.env.data.universalLoginTemplates.get(tenantId).catch(() => null),
    ]);

    // Live form overrides win over stored values so the preview matches what
    // the admin is editing.
    const resolvedTheme = {
      ...(theme ?? DEFAULT_THEME),
      ...themeOverride,
    };
    const resolvedBranding = {
      ...(branding ?? DEFAULT_BRANDING),
      ...brandingOverride,
    };
    const templateBody =
      body ?? storedTemplate?.body ?? DEFAULT_UNIVERSAL_LOGIN_TEMPLATE;

    const tenant = await ctx.env.data.tenants.get(tenantId);
    const clientName = tenant?.friendly_name || "Preview";

    const previewScreen = buildPreviewScreen(screen ?? "login");
    const darkMode = resolveDarkMode(ctx, resolvedBranding);

    return renderWidgetPageResponse(ctx, {
      screenId: previewScreen.name,
      screenJson: JSON.stringify(previewScreen),
      brandingJson: JSON.stringify(resolvedBranding),
      themeJson: JSON.stringify(resolvedTheme),
      state: "preview",
      authParamsJson: JSON.stringify({ client_id: "preview" }),
      branding: resolvedBranding,
      theme: resolvedTheme,
      clientName,
      poweredByLogo: ctx.env.poweredByLogo,
      language: "en",
      availableLanguages: [...locales],
      darkMode,
      customTemplateBody: templateBody,
    });
  },
});

export const brandingRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  .openapiRoutes([
    getRoot,
    patchRoot,
    getTemplatesUniversalLogin,
    putTemplatesUniversalLogin,
    deleteTemplatesUniversalLogin,
    postTemplatesUniversalLoginPreview,
  ] as const)
  .route("/themes", themesRoutes);
