import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { brandingSchema } from "@authhero/adapter-interfaces";
import { themesRoutes } from "./themes";
import { DEFAULT_BRANDING } from "../../constants/defaultBranding";
import { HTTPException } from "hono/http-exception";

const universalLoginTemplateSchema = z.object({
  body: z.string(),
});

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
      const updatedBranding = await ctx.env.data.branding.get(
        ctx.var.tenant_id,
      );

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
              schema: universalLoginTemplateSchema,
            },
          },
          description: "Universal login template",
        },
        404: {
          description: "Template not found",
        },
      },
    }),
    async (ctx) => {
      const template = await ctx.env.data.universalLoginTemplates.get(
        ctx.var.tenant_id,
      );

      if (!template) {
        throw new HTTPException(404, { message: "Template not found" });
      }

      return ctx.json(template);
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
              schema: universalLoginTemplateSchema,
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
        204: {
          description: "Template updated successfully",
        },
        400: {
          description: "Invalid template",
        },
      },
    }),
    async (ctx) => {
      const template = ctx.req.valid("json");

      // Validate template contains required Liquid tags
      if (!template.body.includes("{%- auth0:head -%}")) {
        throw new HTTPException(400, {
          message: "Template must contain {%- auth0:head -%} tag",
        });
      }
      if (!template.body.includes("{%- auth0:widget -%}")) {
        throw new HTTPException(400, {
          message: "Template must contain {%- auth0:widget -%} tag",
        });
      }

      await ctx.env.data.universalLoginTemplates.set(
        ctx.var.tenant_id,
        template,
      );

      return ctx.body(null, 204);
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
          description: "Template deleted successfully",
        },
      },
    }),
    async (ctx) => {
      await ctx.env.data.universalLoginTemplates.delete(ctx.var.tenant_id);

      return ctx.body(null, 204);
    },
  )
  // --------------------------------
  // Themes sub-routes
  // --------------------------------
  .route("/themes", themesRoutes);
