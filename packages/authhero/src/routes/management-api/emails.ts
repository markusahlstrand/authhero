import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { emailProviderSchema, LogTypes } from "@authhero/adapter-interfaces";
import { logMessage } from "../../helpers/logging";
import { HTTPException } from "hono/http-exception";

export const emailProviderRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
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
          "tenant-id": z.string().optional(),
        }),
      },
      security: [
        {
          Bearer: ["read:emails", "auth:read"],
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
      const emailProvider = await ctx.env.data.emailProviders.get(
        ctx.var.tenant_id,
      );

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
          "tenant-id": z.string().optional(),
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
          Bearer: ["create:emails", "auth:write"],
        },
      ],
      responses: {
        200: {
          description: "Branding settings",
        },
      },
    }),
    async (ctx) => {
      const emailProvider = ctx.req.valid("json");

      await ctx.env.data.emailProviders.create(
        ctx.var.tenant_id,
        emailProvider,
      );

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Create Email Provider",
        targetType: "email_provider",
        targetId: ctx.var.tenant_id,
      });

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
          "tenant-id": z.string().optional(),
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
          Bearer: ["update:emails", "auth:write"],
        },
      ],
      responses: {
        200: {
          description: "Branding settings",
        },
      },
    }),
    async (ctx) => {
      const branding = ctx.req.valid("json");

      await ctx.env.data.emailProviders.update(ctx.var.tenant_id, branding);

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Update Email Provider",
        targetType: "email_provider",
        targetId: ctx.var.tenant_id,
      });

      return ctx.text("OK");
    },
  );
