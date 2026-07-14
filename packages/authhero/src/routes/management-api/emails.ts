import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { emailProviderSchema, LogTypes } from "@authhero/adapter-interfaces";
import { logMessage } from "../../helpers/logging";
import { HTTPException } from "hono/http-exception";
import { defineRoute } from "../../utils/define-route";
import { requireTenantId } from "./helpers";
const getRoot = defineRoute({
  route: createRoute({
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
        Bearer: ["read:email_provider"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object(emailProviderSchema.shape).partial(),
          },
        },
        description: "Email provider",
      },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const emailProvider = await ctx.env.data.emailProviders.get(tenantId);

    // Auth0 returns 200 with an empty object when no provider is configured.
    return ctx.json(emailProvider ?? {});
  },
});

const postRoot = defineRoute({
  route: createRoute({
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
        Bearer: ["create:email_provider"],
      },
    ],
    responses: {
      201: {
        content: {
          "application/json": {
            schema: emailProviderSchema,
          },
        },
        description: "Email provider",
      },
      409: {
        description: "Email provider already configured",
      },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const emailProvider = ctx.req.valid("json");

    // Match Auth0: POST is strict create. If the singleton already exists,
    // return 409 — clients should PATCH to update, or DELETE first.
    const existing = await ctx.env.data.emailProviders.get(tenantId);
    if (existing) {
      throw new HTTPException(409, {
        message: "Email provider already configured",
      });
    }

    await ctx.env.data.emailProviders.create(tenantId, emailProvider);

    await logMessage(ctx, tenantId, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Create Email Provider",
      targetType: "email_provider",
      targetId: tenantId,
    });

    const stored = await ctx.env.data.emailProviders.get(tenantId);
    return ctx.json(stored ?? emailProvider, { status: 201 });
  },
});

const patchRoot = defineRoute({
  route: createRoute({
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
        Bearer: ["update:email_provider"],
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
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const patch = ctx.req.valid("json");

    await ctx.env.data.emailProviders.update(tenantId, patch);

    const updated = await ctx.env.data.emailProviders.get(tenantId);
    if (!updated) {
      throw new HTTPException(404, { message: "Email provider not found" });
    }

    await logMessage(ctx, tenantId, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Update Email Provider",
      targetType: "email_provider",
      targetId: tenantId,
    });

    return ctx.json(updated);
  },
});

const deleteRoot = defineRoute({
  route: createRoute({
    tags: ["emails"],
    method: "delete",
    path: "/",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
    },
    security: [
      {
        Bearer: ["delete:email_provider"],
      },
    ],
    responses: {
      204: {
        description: "Email provider deleted",
      },
      404: {
        description: "Email provider not found",
      },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const existing = await ctx.env.data.emailProviders.get(tenantId);
    if (!existing) {
      throw new HTTPException(404, { message: "Email provider not found" });
    }

    await ctx.env.data.emailProviders.remove(tenantId);

    await logMessage(ctx, tenantId, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Delete Email Provider",
      targetType: "email_provider",
      targetId: tenantId,
    });

    return ctx.body(null, 204);
  },
});

export const emailProviderRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([getRoot, postRoot, patchRoot, deleteRoot] as const);
