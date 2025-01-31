import { Bindings } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { emailProviderSchema } from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";

export const emailProviderRoutes = new OpenAPIHono<{ Bindings: Bindings }>()
  // --------------------------------
  // GET /api/v2/emails/provider
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["emails"],
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
              schema: emailProviderSchema,
            },
          },
          description: "Email provider",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");

      const emailProvider = await ctx.env.data.emailProviders.get(tenant_id);

      if (!emailProvider) {
        throw new HTTPException(404, { message: "Email provider not found" });
      }

      return ctx.json(emailProvider);
    },
  )
  // --------------------------------
  // POST /api/v2/emails/provider
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["emails"],
      method: "post",
      path: "/",
      request: {
        headers: z.object({
          "tenant-id": z.string(),
        }),
        body: {
          content: {
            "application/json": {
              schema: z.object(emailProviderSchema.shape),
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
          description: "Branding settings",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");

      const emailProvider = ctx.req.valid("json");

      await ctx.env.data.emailProviders.create(tenant_id, emailProvider);

      return ctx.text("OK", { status: 201 });
    },
  )
  // --------------------------------
  // PATCH /api/v2/emails/provider
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["emails"],
      method: "patch",
      path: "/",
      request: {
        headers: z.object({
          "tenant-id": z.string(),
        }),
        body: {
          content: {
            "application/json": {
              schema: z.object(emailProviderSchema.shape).partial(),
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
          description: "Branding settings",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");

      const branding = ctx.req.valid("json");

      await ctx.env.data.emailProviders.update(tenant_id, branding);

      return ctx.text("OK");
    },
  );
