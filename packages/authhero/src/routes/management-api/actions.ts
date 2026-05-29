import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  Action,
  ActionVersion,
  actionInsertSchema,
  actionSchema,
  actionVersionSchema,
  DataAdapters,
  totalsSchema,
  LogTypes,
} from "@authhero/adapter-interfaces";
import { logMessage } from "../../helpers/logging";
import { querySchema } from "../../types/auth0/Query";
import { parseSort } from "../../utils/sort";
import { HTTPException } from "hono/http-exception";

import { defineRoute } from "../../utils/define-route";
const actionsWithTotalsSchema = totalsSchema.extend({
  actions: z.array(actionSchema),
});

const AUTH0_TO_INTERNAL_TRIGGER: Record<string, string> = {
  "post-login": "post-user-login",
};

function toInternalTriggerId(triggerId: string): string {
  return AUTH0_TO_INTERNAL_TRIGGER[triggerId] || triggerId;
}

const versionsResponseSchema = z.object({
  versions: z.array(actionVersionSchema),
});

const versionsWithTotalsSchema = totalsSchema.extend({
  versions: z.array(actionVersionSchema),
});

function snapshotActionVersion(
  data: DataAdapters,
  tenant_id: string,
  action: Action,
  deployed: boolean,
): Promise<ActionVersion> {
  return data.actionVersions.create(tenant_id, {
    action_id: action.id,
    code: action.code,
    runtime: action.runtime,
    secrets: action.secrets,
    dependencies: action.dependencies,
    supported_triggers: action.supported_triggers,
    deployed,
  });
}
const getRoot = defineRoute({
  route: createRoute({
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
        Bearer: ["read:actions"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.union([z.array(actionSchema), actionsWithTotalsSchema]),
          },
        },
        description: "List of actions",
      },
    },
  }),
  handler: async (ctx) => {
    const { page, per_page, include_totals, sort, q } = ctx.req.valid("query");

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
});

const postRoot = defineRoute({
  route: createRoute({
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
        Bearer: ["create:actions"],
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
  handler: async (ctx) => {
    const body = ctx.req.valid("json");

    const action = await ctx.env.data.actions.create(ctx.var.tenant_id, body);

    // Deploy to execution environment if supported. Track success so the
    // snapshot reflects what's actually live in the executor — a failed
    // deploy must not overwrite a previously-deployed snapshot.
    let deployed = false;
    if (ctx.env.codeExecutor?.deploy) {
      try {
        await ctx.env.codeExecutor.deploy(action.id, body.code);
        deployed = true;
      } catch (err) {
        await logMessage(ctx, ctx.var.tenant_id, {
          type: LogTypes.FAILED_HOOK,
          description: `Failed to deploy action ${action.id}: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    } else {
      // No executor configured — treat as deployed since there's nothing
      // to deploy to and the action row is the source of truth.
      deployed = true;
    }

    await snapshotActionVersion(
      ctx.env.data,
      ctx.var.tenant_id,
      action,
      deployed,
    );

    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Create action",
      targetType: "action",
      targetId: action.id,
    });

    return ctx.json(action, { status: 201 });
  },
});

const getById = defineRoute({
  route: createRoute({
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
        Bearer: ["read:actions"],
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
  handler: async (ctx) => {
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
});

const patchById = defineRoute({
  route: createRoute({
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
        Bearer: ["update:actions"],
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
  handler: async (ctx) => {
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

    // Re-deploy if code changed. PATCH effectively double-deploys when
    // followed by an explicit POST /deploy, but snapshotting here keeps
    // version history aligned with what's actually live in the executor.
    if (body.code !== undefined && ctx.env.codeExecutor?.deploy) {
      let deployed = false;
      try {
        await ctx.env.codeExecutor.deploy(id, body.code);
        deployed = true;
      } catch (err) {
        await logMessage(ctx, ctx.var.tenant_id, {
          type: LogTypes.FAILED_HOOK,
          description: `Failed to deploy action ${id}: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      await snapshotActionVersion(
        ctx.env.data,
        ctx.var.tenant_id,
        action,
        deployed,
      );
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
});

const deleteById = defineRoute({
  route: createRoute({
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
        Bearer: ["delete:actions"],
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
  handler: async (ctx) => {
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

    await ctx.env.data.actionVersions.removeForAction(ctx.var.tenant_id, id);

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
});

const postByIdDeploy = defineRoute({
  route: createRoute({
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
        Bearer: ["update:actions"],
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
  handler: async (ctx) => {
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

    await ctx.env.data.actions.update(ctx.var.tenant_id, id, {
      status: "built",
      deployed_at: new Date().toISOString(),
    });

    // Reached only after a successful executor deploy (or none configured).
    await snapshotActionVersion(ctx.env.data, ctx.var.tenant_id, action, true);

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
});

const getByActionIdVersions = defineRoute({
  route: createRoute({
    tags: ["actions"],
    method: "get",
    path: "/{actionId}/versions",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      params: z.object({
        actionId: z.string(),
      }),
      query: querySchema,
    },
    security: [
      {
        Bearer: ["read:actions"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.union([versionsResponseSchema, versionsWithTotalsSchema]),
          },
        },
        description: "List of action versions",
      },
      404: {
        description: "Action not found",
      },
    },
  }),
  handler: async (ctx) => {
    const { actionId } = ctx.req.valid("param");
    const { page, per_page, include_totals, sort } = ctx.req.valid("query");

    const action = await ctx.env.data.actions.get(ctx.var.tenant_id, actionId);
    if (!action) {
      throw new HTTPException(404, { message: "Action not found" });
    }

    const result = await ctx.env.data.actionVersions.list(
      ctx.var.tenant_id,
      actionId,
      {
        page,
        per_page,
        include_totals,
        sort: parseSort(sort),
      },
    );

    const versions = result.versions.map((v) => ({
      ...v,
      secrets: v.secrets?.map((s) => ({ name: s.name })),
    }));

    if (!include_totals) {
      return ctx.json({ versions });
    }

    return ctx.json({ ...result, versions });
  },
});

const getByActionIdVersionsById = defineRoute({
  route: createRoute({
    tags: ["actions"],
    method: "get",
    path: "/{actionId}/versions/{id}",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      params: z.object({
        actionId: z.string(),
        id: z.string(),
      }),
    },
    security: [
      {
        Bearer: ["read:actions"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: actionVersionSchema,
          },
        },
        description: "Action version",
      },
      404: {
        description: "Action version not found",
      },
    },
  }),
  handler: async (ctx) => {
    const { actionId, id } = ctx.req.valid("param");

    const version = await ctx.env.data.actionVersions.get(
      ctx.var.tenant_id,
      actionId,
      id,
    );
    if (!version) {
      throw new HTTPException(404, {
        message: "Action version not found",
      });
    }

    return ctx.json({
      ...version,
      secrets: version.secrets?.map((s) => ({ name: s.name })),
    });
  },
});

const postByActionIdVersionsByIdDeploy = defineRoute({
  route: createRoute({
    tags: ["actions"],
    method: "post",
    path: "/{actionId}/versions/{id}/deploy",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      params: z.object({
        actionId: z.string(),
        id: z.string(),
      }),
    },
    security: [
      {
        Bearer: ["update:actions"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: actionSchema,
          },
        },
        description: "The action after rollback",
      },
      404: {
        description: "Action version not found",
      },
    },
  }),
  handler: async (ctx) => {
    const { actionId, id } = ctx.req.valid("param");

    const version = await ctx.env.data.actionVersions.get(
      ctx.var.tenant_id,
      actionId,
      id,
    );
    if (!version) {
      throw new HTTPException(404, {
        message: "Action version not found",
      });
    }

    if (ctx.env.codeExecutor?.deploy) {
      try {
        await ctx.env.codeExecutor.deploy(actionId, version.code);
      } catch (err) {
        await logMessage(ctx, ctx.var.tenant_id, {
          type: LogTypes.FAILED_HOOK,
          description: `Failed to roll back action ${actionId} to version ${id}: ${err instanceof Error ? err.message : String(err)}`,
        });
        throw new HTTPException(500, {
          message: `Rollback failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    await ctx.env.data.actions.update(ctx.var.tenant_id, actionId, {
      code: version.code,
      runtime: version.runtime,
      secrets: version.secrets,
      dependencies: version.dependencies,
      supported_triggers: version.supported_triggers,
      status: "built",
      deployed_at: new Date().toISOString(),
    });

    const updated = await ctx.env.data.actions.get(ctx.var.tenant_id, actionId);
    if (!updated) {
      throw new HTTPException(404, { message: "Action not found" });
    }

    await snapshotActionVersion(ctx.env.data, ctx.var.tenant_id, updated, true);

    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: `Roll back action to version ${version.number}`,
      targetType: "action",
      targetId: actionId,
    });

    return ctx.json({
      ...updated,
      secrets: updated.secrets?.map((s) => ({ name: s.name })),
    });
  },
});

const postByIdTest = defineRoute({
  route: createRoute({
    tags: ["actions"],
    method: "post",
    path: "/{id}/test",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      params: z.object({ id: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              trigger_id: z.string().optional(),
              event: z.record(z.string(), z.unknown()).optional(),
            }),
          },
        },
      },
    },
    security: [
      {
        Bearer: ["update:actions"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              error: z.string().optional(),
              duration_ms: z.number(),
              api_calls: z.array(
                z.object({
                  method: z.string(),
                  args: z.array(z.unknown()),
                }),
              ),
              logs: z.array(
                z.object({
                  level: z.enum(["log", "info", "warn", "error", "debug"]),
                  message: z.string(),
                }),
              ),
            }),
          },
        },
        description: "Test run result",
      },
      404: { description: "Action not found" },
      503: { description: "Code executor not configured" },
    },
  }),
  handler: async (ctx) => {
    const { id } = ctx.req.valid("param");
    const body = ctx.req.valid("json");

    const codeExecutor = ctx.env.codeExecutor;
    if (!codeExecutor) {
      throw new HTTPException(503, {
        message: "Code executor not configured",
      });
    }

    const action = await ctx.env.data.actions.get(ctx.var.tenant_id, id);
    if (!action) {
      throw new HTTPException(404, { message: "Action not found" });
    }

    const rawTriggerId =
      body.trigger_id ?? action.supported_triggers?.[0]?.id ?? "post-login";
    const triggerId = toInternalTriggerId(rawTriggerId);

    const secrets = action.secrets?.reduce<Record<string, string>>((acc, s) => {
      if (s.value !== undefined) acc[s.name] = s.value;
      return acc;
    }, {});

    const result = await codeExecutor.execute({
      code: action.code,
      hookCodeId: action.id,
      triggerId,
      event: { ...(body.event ?? {}), secrets: secrets ?? {} },
      timeoutMs: 5000,
    });

    return ctx.json({
      success: result.success,
      error: result.error,
      duration_ms: result.durationMs,
      api_calls: result.apiCalls,
      logs: result.logs ?? [],
    });
  },
});

export const actionsRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([
  getRoot,
  postRoot,
  getById,
  patchById,
  deleteById,
  postByIdDeploy,
  getByActionIdVersions,
  getByActionIdVersionsById,
  postByActionIdVersionsByIdDeploy,
  postByIdTest,
] as const);
