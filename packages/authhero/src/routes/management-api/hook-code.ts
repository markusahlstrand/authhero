import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  hookCodeInsertSchema,
  hookCodeSchema,
  LogTypes,
} from "@authhero/adapter-interfaces";
import { logMessage } from "../../helpers/logging";
import { HTTPException } from "hono/http-exception";

export const hookCodeRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // POST /api/v2/hook-code
  // --------------------------------
  .openapi(
    createRoute({
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
          Bearer: ["create:hooks", "auth:write"],
        },
      ],
      responses: {
        201: {
          content: {
            "application/json": {
              schema: hookCodeSchema,
            },
          },
          description: "The created hook code",
        },
      },
    }),
    async (ctx) => {
      const body = ctx.req.valid("json");

      const hookCode = await ctx.env.data.hookCode.create(
        ctx.var.tenant_id,
        body,
      );

      // Deploy to execution environment if supported
      if (ctx.env.codeExecutor?.deploy) {
        try {
          await ctx.env.codeExecutor.deploy(hookCode.id, body.code);
        } catch (err) {
          await logMessage(ctx, ctx.var.tenant_id, {
            type: LogTypes.FAILED_HOOK,
            description: `Failed to deploy hook code ${hookCode.id}: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Create hook code",
        targetType: "hook_code",
        targetId: hookCode.id,
      });

      return ctx.json(hookCode, { status: 201 });
    },
  )
  // --------------------------------
  // GET /api/v2/hook-code/:id
  // --------------------------------
  .openapi(
    createRoute({
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
          Bearer: ["read:hooks", "auth:read"],
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
    async (ctx) => {
      const { id } = ctx.req.valid("param");

      const hookCode = await ctx.env.data.hookCode.get(ctx.var.tenant_id, id);

      if (!hookCode) {
        throw new HTTPException(404, { message: "Hook code not found" });
      }

      return ctx.json(hookCode);
    },
  )
  // --------------------------------
  // PUT /api/v2/hook-code/:id
  // --------------------------------
  .openapi(
    createRoute({
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
          Bearer: ["update:hooks", "auth:write"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: hookCodeSchema,
            },
          },
          description: "The updated hook code",
        },
        404: {
          description: "Hook code not found",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");
      const body = ctx.req.valid("json");

      const updated = await ctx.env.data.hookCode.update(
        ctx.var.tenant_id,
        id,
        body,
      );
      if (!updated) {
        throw new HTTPException(404, { message: "Hook code not found" });
      }

      const hookCode = await ctx.env.data.hookCode.get(ctx.var.tenant_id, id);

      // Re-deploy to execution environment if supported
      if (body.code && ctx.env.codeExecutor?.deploy) {
        try {
          await ctx.env.codeExecutor.deploy(id, body.code);
        } catch (err) {
          await logMessage(ctx, ctx.var.tenant_id, {
            type: LogTypes.FAILED_HOOK,
            description: `Failed to deploy hook code ${id}: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Update hook code",
        targetType: "hook_code",
        targetId: id,
      });

      return ctx.json(hookCode);
    },
  )
  // --------------------------------
  // DELETE /api/v2/hook-code/:id
  // --------------------------------
  .openapi(
    createRoute({
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
          Bearer: ["delete:hooks", "auth:write"],
        },
      ],
      responses: {
        200: {
          description: "Hook code deleted",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");

      const result = await ctx.env.data.hookCode.remove(ctx.var.tenant_id, id);

      if (!result) {
        throw new HTTPException(404, { message: "Hook code not found" });
      }

      // Remove from execution environment if supported
      if (ctx.env.codeExecutor?.remove) {
        try {
          await ctx.env.codeExecutor.remove(id);
        } catch (err) {
          await logMessage(ctx, ctx.var.tenant_id, {
            type: LogTypes.FAILED_HOOK,
            description: `Failed to remove hook worker ${id}: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Delete hook code",
        targetType: "hook_code",
        targetId: id,
      });

      return ctx.text("OK");
    },
  );
