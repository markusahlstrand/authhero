import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  hookCodeInsertSchema,
  hookCodeSchema,
  LogTypes,
} from "@authhero/adapter-interfaces";
import { logMessage } from "../../helpers/logging";
import { HTTPException } from "hono/http-exception";

import { defineRoute } from "../../utils/define-route";
import { requireTenantId } from "./helpers";
const hookCodeResponseSchema = hookCodeSchema.extend({
  deploymentStatus: z.enum(["deployed", "failed", "not_required"]),
  deploymentError: z.string().optional(),
});
const postRoot = defineRoute({
  route: createRoute({
    tags: ["hook-code"],
    method: "post",
    path: "/",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      body: {
        content: {
          "application/json": {
            schema: hookCodeInsertSchema,
          },
        },
      },
    },
    security: [
      {
        Bearer: ["create:hooks"],
      },
    ],
    responses: {
      201: {
        content: {
          "application/json": {
            schema: hookCodeResponseSchema,
          },
        },
        description: "The created hook code",
      },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const body = ctx.req.valid("json");

    const hookCode = await ctx.env.data.hookCode.create(tenantId, body);

    // Deploy to execution environment if supported
    let deploymentStatus: "deployed" | "failed" | "not_required" =
      "not_required";
    let deploymentError: string | undefined;

    if (ctx.env.codeExecutor?.deploy) {
      try {
        await ctx.env.codeExecutor.deploy(hookCode.id, body.code);
        deploymentStatus = "deployed";
      } catch (err) {
        deploymentStatus = "failed";
        deploymentError = err instanceof Error ? err.message : String(err);
        await logMessage(ctx, tenantId, {
          type: LogTypes.FAILED_HOOK,
          description: `Failed to deploy hook code ${hookCode.id}: ${deploymentError}`,
        });
      }
    }

    await logMessage(ctx, tenantId, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Create hook code",
      targetType: "hook_code",
      targetId: hookCode.id,
    });

    return ctx.json(
      { ...hookCode, deploymentStatus, deploymentError },
      { status: 201 },
    );
  },
});

const getById = defineRoute({
  route: createRoute({
    tags: ["hook-code"],
    method: "get",
    path: "/{id}",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      params: z.object({
        id: z.string(),
      }),
    },
    security: [
      {
        Bearer: ["read:hooks"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: hookCodeSchema,
          },
        },
        description: "The hook code",
      },
      404: {
        description: "Hook code not found",
      },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const { id } = ctx.req.valid("param");

    const hookCode = await ctx.env.data.hookCode.get(tenantId, id);

    if (!hookCode) {
      throw new HTTPException(404, { message: "Hook code not found" });
    }

    return ctx.json(hookCode);
  },
});

const putById = defineRoute({
  route: createRoute({
    tags: ["hook-code"],
    method: "put",
    path: "/{id}",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      params: z.object({
        id: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: hookCodeInsertSchema,
          },
        },
      },
    },
    security: [
      {
        Bearer: ["update:hooks"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: hookCodeResponseSchema,
          },
        },
        description: "The updated hook code",
      },
      404: {
        description: "Hook code not found",
      },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const { id } = ctx.req.valid("param");
    const body = ctx.req.valid("json");

    const updated = await ctx.env.data.hookCode.update(tenantId, id, body);
    if (!updated) {
      throw new HTTPException(404, { message: "Hook code not found" });
    }

    const hookCode = await ctx.env.data.hookCode.get(tenantId, id);
    if (!hookCode) {
      throw new HTTPException(404, { message: "Hook code not found" });
    }

    // Re-deploy to execution environment if supported
    let deploymentStatus: "deployed" | "failed" | "not_required" =
      "not_required";
    let deploymentError: string | undefined;

    if (body.code !== undefined && ctx.env.codeExecutor?.deploy) {
      try {
        await ctx.env.codeExecutor.deploy(id, body.code);
        deploymentStatus = "deployed";
      } catch (err) {
        deploymentStatus = "failed";
        deploymentError = err instanceof Error ? err.message : String(err);
        await logMessage(ctx, tenantId, {
          type: LogTypes.FAILED_HOOK,
          description: `Failed to deploy hook code ${id}: ${deploymentError}`,
        });
      }
    }

    await logMessage(ctx, tenantId, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Update hook code",
      targetType: "hook_code",
      targetId: id,
    });

    return ctx.json({ ...hookCode, deploymentStatus, deploymentError });
  },
});

const deleteById = defineRoute({
  route: createRoute({
    tags: ["hook-code"],
    method: "delete",
    path: "/{id}",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      params: z.object({
        id: z.string(),
      }),
    },
    security: [
      {
        Bearer: ["delete:hooks"],
      },
    ],
    responses: {
      200: {
        description: "Hook code deleted",
      },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const { id } = ctx.req.valid("param");

    const result = await ctx.env.data.hookCode.remove(tenantId, id);

    if (!result) {
      throw new HTTPException(404, { message: "Hook code not found" });
    }

    // Remove from execution environment if supported
    if (ctx.env.codeExecutor?.remove) {
      try {
        await ctx.env.codeExecutor.remove(id);
      } catch (err) {
        await logMessage(ctx, tenantId, {
          type: LogTypes.FAILED_HOOK,
          description: `Failed to remove hook worker ${id}: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    await logMessage(ctx, tenantId, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Delete hook code",
      targetType: "hook_code",
      targetId: id,
    });

    return ctx.text("OK");
  },
});

export const hookCodeRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([postRoot, getById, putById, deleteById] as const);
