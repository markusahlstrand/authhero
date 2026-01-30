import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { brandingSchema } from "@authhero/adapter-interfaces";
import { themesRoutes } from "./themes";
import { DEFAULT_BRANDING } from "../../constants/defaultBranding";

// Default Universal Login Template
const DEFAULT_UNIVERSAL_LOGIN_TEMPLATE = `<!DOCTYPE html>
<html>
  <head>
    {%- auth0:head -%}
    <style>
      body { background-color: #f0f2f5; }
      .ulp-button { border-radius: 8px !important; }
    </style>
  </head>
  <body>
    {%- auth0:widget -%}
  </body>
</html>`;

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
          Bearer: ["update:branding", "auth:write"],
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
      const branding = ctx.req.valid("json");

      await ctx.env.data.branding.set(ctx.var.tenant_id, branding);

      // Return the updated branding (like Auth0 does)
      const updatedBranding = await ctx.env.data.branding.get(ctx.var.tenant_id);

      return ctx.json(updatedBranding || DEFAULT_BRANDING);
    },
  )
  // --------------------------------
  // GET /api/v2/branding/templates/universal-login
  // --------------------------------
  .openapi(
    createRoute({
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
          Bearer: ["read:branding", "auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.object({
                template: z.string(),
              }),
            },
          },
          description: "Universal login template",
        },
        404: {
          description: "Template does not exist",
        },
      },
    }),
    async (ctx) => {
      const template = await ctx.env.data.branding.getUniversalLoginTemplate(
        ctx.var.tenant_id,
      );

      if (!template) {
        return ctx.json({ template: DEFAULT_UNIVERSAL_LOGIN_TEMPLATE });
      }

      return ctx.json({ template });
    },
  )
  // --------------------------------
  // PUT /api/v2/branding/templates/universal-login
  // --------------------------------
  .openapi(
    createRoute({
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
              schema: z.object({
                template: z.string().max(102400),
              }),
            },
          },
        },
      },
      security: [
        {
          Bearer: ["update:branding", "auth:write"],
        },
      ],
      responses: {
        201: {
          description: "Template successfully created",
        },
        204: {
          description: "Template successfully updated",
        },
        400: {
          description:
            "Payload content missing required Liquid tags (auth0:head and auth0:widget)",
        },
      },
    }),
    async (ctx) => {
      const { template } = ctx.req.valid("json");

      // Validate required Liquid tags
      if (
        !template.includes("{%- auth0:head -%}") &&
        !template.includes("{% auth0:head %}")
      ) {
        return ctx.json(
          {
            statusCode: 400,
            error: "Bad Request",
            message:
              "Payload content missing required Liquid tag: auth0:head",
          },
          400,
        );
      }

      if (
        !template.includes("{%- auth0:widget -%}") &&
        !template.includes("{% auth0:widget %}")
      ) {
        return ctx.json(
          {
            statusCode: 400,
            error: "Bad Request",
            message:
              "Payload content missing required Liquid tag: auth0:widget",
          },
          400,
        );
      }

      // Check if template already exists
      const existingTemplate =
        await ctx.env.data.branding.getUniversalLoginTemplate(ctx.var.tenant_id);

      await ctx.env.data.branding.setUniversalLoginTemplate(
        ctx.var.tenant_id,
        template,
      );

      if (existingTemplate) {
        return new Response(null, { status: 204 });
      }

      return new Response(null, { status: 201 });
    },
  )
  // --------------------------------
  // DELETE /api/v2/branding/templates/universal-login
  // --------------------------------
  .openapi(
    createRoute({
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
          Bearer: ["delete:branding", "auth:write"],
        },
      ],
      responses: {
        204: {
          description: "Template successfully deleted",
        },
      },
    }),
    async (ctx) => {
      await ctx.env.data.branding.deleteUniversalLoginTemplate(ctx.var.tenant_id);

      return new Response(null, { status: 204 });
    },
  )
  // --------------------------------
  // Themes sub-routes
  // --------------------------------
  .route("/themes", themesRoutes);
