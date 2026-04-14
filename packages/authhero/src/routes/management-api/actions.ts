import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  actionInsertSchema,
  actionSchema,
  totalsSchema,
  LogTypes,
} from "@authhero/adapter-interfaces";
import { logMessage } from "../../helpers/logging";
import { querySchema } from "../../types/auth0/Query";
import { parseSort } from "../../utils/sort";
import { HTTPException } from "hono/http-exception";

const actionsWithTotalsSchema = totalsSchema.extend({
  actions: z.array(actionSchema),
});

export const actionsRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /api/v2/actions/actions
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["actions"],
      method: "get",
      path: "/",
      request: {
        query: querySchema,
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
      },
      security: [
        {
          Bearer: ["read:actions", "auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.union([
                z.array(actionSchema),
                actionsWithTotalsSchema,
              ]),
            },
          },
          description: "List of actions",
        },
      },
    }),
    async (ctx) => {
      const { page, per_page, include_totals, sort, q } =
        ctx.req.valid("query");

      const result = await ctx.env.data.actions.list(ctx.var.tenant_id, {
        page,
        per_page,
        include_totals,
        sort: parseSort(sort),
        q,
      });

      // Strip secret values from response
      const actions = result.actions.map((action) => ({
        ...action,
        secrets: action.secrets?.map((s) => ({ name: s.name })),
      }));

      if (!include_totals) {
        return ctx.json(actions);
      }

      return ctx.json({ ...result, actions });
    },
  )
  // --------------------------------
  // POST /api/v2/actions/actions
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["actions"],
      method: "post",
      path: "/",
      request: {
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
        body: {
          content: {
            "application/json": {
              schema: actionInsertSchema,
            },
          },
        },
      },
      security: [
        {
          Bearer: ["create:actions", "auth:write"],
        },
      ],
      responses: {
        201: {
          content: {
            "application/json": {
              schema: actionSchema,
            },
          },
          description: "The created action",
        },
      },
    }),
    async (ctx) => {
      const body = ctx.req.valid("json");

      const action = await ctx.env.data.actions.create(
        ctx.var.tenant_id,
        body,
      );

      // Deploy to execution environment if supported
      if (ctx.env.codeExecutor?.deploy) {
        try {
          await ctx.env.codeExecutor.deploy(action.id, body.code);
        } catch (err) {
          await logMessage(ctx, ctx.var.tenant_id, {
            type: LogTypes.FAILED_HOOK,
            description: `Failed to deploy action ${action.id}: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Create action",
        targetType: "action",
        targetId: action.id,
      });

      return ctx.json(action, { status: 201 });
    },
  )
  // --------------------------------
  // GET /api/v2/actions/actions/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["actions"],
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
          Bearer: ["read:actions", "auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: actionSchema,
            },
          },
          description: "An action",
        },
        404: {
          description: "Action not found",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");

      const action = await ctx.env.data.actions.get(ctx.var.tenant_id, id);

      if (!action) {
        throw new HTTPException(404, { message: "Action not found" });
      }

      // Strip secret values from response
      return ctx.json({
        ...action,
        secrets: action.secrets?.map((s) => ({ name: s.name })),
      });
    },
  )
  // --------------------------------
  // PATCH /api/v2/actions/actions/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["actions"],
      method: "patch",
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
              schema: actionInsertSchema.partial(),
            },
          },
        },
      },
      security: [
        {
          Bearer: ["update:actions", "auth:write"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: actionSchema,
            },
          },
          description: "The updated action",
        },
        404: {
          description: "Action not found",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");
      const body = ctx.req.valid("json");

      const updated = await ctx.env.data.actions.update(
        ctx.var.tenant_id,
        id,
        body,
      );
      if (!updated) {
        throw new HTTPException(404, { message: "Action not found" });
      }

      const action = await ctx.env.data.actions.get(ctx.var.tenant_id, id);
      if (!action) {
        throw new HTTPException(404, { message: "Action not found" });
      }

      // Re-deploy if code changed
      if (body.code !== undefined && ctx.env.codeExecutor?.deploy) {
        try {
          await ctx.env.codeExecutor.deploy(id, body.code);
        } catch (err) {
          await logMessage(ctx, ctx.var.tenant_id, {
            type: LogTypes.FAILED_HOOK,
            description: `Failed to deploy action ${id}: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Update action",
        targetType: "action",
        targetId: id,
      });

      return ctx.json({
        ...action,
        secrets: action.secrets?.map((s) => ({ name: s.name })),
      });
    },
  )
  // --------------------------------
  // DELETE /api/v2/actions/actions/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["actions"],
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
          Bearer: ["delete:actions", "auth:write"],
        },
      ],
      responses: {
        200: {
          description: "Action deleted",
        },
        404: {
          description: "Action not found",
        },
        409: {
          description: "Action is bound to a trigger and cannot be deleted",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");

      // Check if action is bound to any triggers via hooks
      const hooks = await ctx.env.data.hooks.list(ctx.var.tenant_id, {
        q: `code_id:"${id}"`,
      });
      if (hooks.hooks.length > 0) {
        throw new HTTPException(409, {
          message:
            "Action is bound to a trigger. Remove the binding before deleting.",
        });
      }

      const result = await ctx.env.data.actions.remove(ctx.var.tenant_id, id);
      if (!result) {
        throw new HTTPException(404, { message: "Action not found" });
      }

      // Remove from execution environment if supported
      if (ctx.env.codeExecutor?.remove) {
        try {
          await ctx.env.codeExecutor.remove(id);
        } catch (err) {
          await logMessage(ctx, ctx.var.tenant_id, {
            type: LogTypes.FAILED_HOOK,
            description: `Failed to remove action worker ${id}: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Delete action",
        targetType: "action",
        targetId: id,
      });

      return ctx.text("OK");
    },
  )
  // --------------------------------
  // POST /api/v2/actions/actions/:id/deploy
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["actions"],
      method: "post",
      path: "/{id}/deploy",
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
          Bearer: ["update:actions", "auth:write"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: actionSchema,
            },
          },
          description: "The deployed action",
        },
        404: {
          description: "Action not found",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");

      const action = await ctx.env.data.actions.get(ctx.var.tenant_id, id);
      if (!action) {
        throw new HTTPException(404, { message: "Action not found" });
      }

      // Deploy to execution environment
      if (ctx.env.codeExecutor?.deploy) {
        try {
          await ctx.env.codeExecutor.deploy(id, action.code);
        } catch (err) {
          await logMessage(ctx, ctx.var.tenant_id, {
            type: LogTypes.FAILED_HOOK,
            description: `Failed to deploy action ${id}: ${err instanceof Error ? err.message : String(err)}`,
          });
          throw new HTTPException(500, {
            message: `Deployment failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }

      // Update status and deployed_at
      await ctx.env.data.actions.update(ctx.var.tenant_id, id, {});
      // We need a way to set status/deployed_at - for now we update via the adapter

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Deploy action",
        targetType: "action",
        targetId: id,
      });

      return ctx.json({
        ...action,
        status: "built" as const,
        secrets: action.secrets?.map((s) => ({ name: s.name })),
      });
    },
  );
