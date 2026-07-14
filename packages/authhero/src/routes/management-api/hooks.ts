import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  hookInsertSchema,
  hookSchema,
  LogTypes,
} from "@authhero/adapter-interfaces";
import { logMessage } from "../../helpers/logging";
import { querySchema } from "../../types/auth0/Query";
import { parseSort } from "../../utils/sort";
import { HTTPException } from "hono/http-exception";
import { generateHookId } from "../../utils/entity-id";
import { invokeWebHook } from "../../hooks/webhooks";

import { defineRoute } from "../../utils/define-route";
import { requireTenantId, withTotals, listResponse } from "./helpers";
const hooksWithTotalsSchema = withTotals({
  hooks: z.array(hookSchema),
});
const getRoot = defineRoute({
  route: createRoute({
    tags: ["hooks"],
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
        Bearer: ["read:hooks"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.union([z.array(hookSchema), hooksWithTotalsSchema]),
          },
        },
        description: "List of hooks",
      },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const { page, per_page, include_totals, sort, q } = ctx.req.valid("query");

    const hooks = await ctx.env.data.hooks.list(tenantId, {
      page,
      per_page,
      include_totals,
      sort: parseSort(sort),
      q,
    });

    return ctx.json(listResponse(include_totals, hooks, "hooks"));
  },
});

const postRoot = defineRoute({
  route: createRoute({
    tags: ["hooks"],
    method: "post",
    path: "/",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      body: {
        content: {
          "application/json": {
            schema: hookInsertSchema, // Directly use the union schema
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
            schema: hookSchema,
          },
        },
        description: "The created hook",
      },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const hook = ctx.req.valid("json");

    const hookData = {
      ...hook,
      hook_id: hook.hook_id || generateHookId(),
    };

    const hooks = await ctx.env.data.hooks.create(tenantId, hookData);

    await logMessage(ctx, tenantId, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Create a Hook",
      targetType: "hook",
      targetId: hooks.hook_id,
      afterState: hooks as Record<string, unknown>,
    });

    return ctx.json(hooks, { status: 201 });
  },
});

const patchByHook_id = defineRoute({
  route: createRoute({
    tags: ["hooks"],
    method: "patch",
    path: "/{hook_id}",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      params: z.object({
        hook_id: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            // Apply transformations to each member of the hookInsertSchema union
            schema: z.union(
              hookInsertSchema.options.map((option: any) =>
                option.omit({ hook_id: true }).partial(),
              ) as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]],
            ),
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
            schema: hookSchema, // Directly use the union schema
          },
        },
        description: "The updated hook",
      },
      404: {
        description: "Hook not found",
      },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const { hook_id } = ctx.req.valid("param");
    // Zod 4 widens the per-member `.options` array's inferred element type
    // to `unknown` when the members are produced via a runtime `.map`; the
    // validator at the route boundary already enforces the schema, so the
    // shape matches `Partial<HookInsert>` at runtime.
    const hook = ctx.req.valid("json") as Parameters<
      typeof ctx.env.data.hooks.update
    >[2];

    await ctx.env.data.hooks.update(tenantId, hook_id, hook);
    const result = await ctx.env.data.hooks.get(tenantId, hook_id);

    if (!result) {
      throw new HTTPException(404, { message: "Hook not found" });
    }

    await logMessage(ctx, tenantId, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Update a Hook",
      targetType: "hook",
      targetId: hook_id,
      afterState: result as Record<string, unknown>,
    });

    return ctx.json(result);
  },
});

const getByHook_id = defineRoute({
  route: createRoute({
    tags: ["hooks"],
    method: "get",
    path: "/{hook_id}",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      params: z.object({
        hook_id: z.string(),
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
            schema: hookSchema,
          },
        },
        description: "A hook",
      },
      404: {
        description: "Hook not found",
      },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const { hook_id } = ctx.req.valid("param");

    const hook = await ctx.env.data.hooks.get(tenantId, hook_id);

    if (!hook) {
      throw new HTTPException(404, { message: "Hook not found" });
    }

    return ctx.json(hook);
  },
});

const deleteByHook_id = defineRoute({
  route: createRoute({
    tags: ["hooks"],
    method: "delete",
    path: "/{hook_id}",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      params: z.object({
        hook_id: z.string(),
      }),
    },

    security: [
      {
        Bearer: ["delete:hooks"],
      },
    ],
    responses: {
      200: {
        description: "A hook",
      },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const { hook_id } = ctx.req.valid("param");

    const result = await ctx.env.data.hooks.remove(tenantId, hook_id);

    if (!result) {
      throw new HTTPException(404, { message: "Hook not found" });
    }

    await logMessage(ctx, tenantId, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Delete a Hook",
      targetType: "hook",
      targetId: hook_id,
    });

    return ctx.text("OK");
  },
});

const tryByHook_id = defineRoute({
  route: createRoute({
    tags: ["hooks"],
    method: "post",
    path: "/{hook_id}/try",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      params: z.object({
        hook_id: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              user_id: z.string(),
            }),
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
            schema: z.object({
              ok: z.boolean(),
              status: z.number().optional(),
              body: z.string().optional(),
              error: z.string().optional(),
            }),
          },
        },
        description:
          "Invokes the webhook with the given user and returns the upstream response. authhero extension; not available in Auth0.",
      },
      400: {
        description: "Hook is not a web hook",
      },
      404: {
        description: "Hook or user not found",
      },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const { hook_id } = ctx.req.valid("param");
    const { user_id } = ctx.req.valid("json");

    const hook = await ctx.env.data.hooks.get(tenantId, hook_id);
    if (!hook) {
      throw new HTTPException(404, { message: "Hook not found" });
    }
    if (!("url" in hook)) {
      throw new HTTPException(400, {
        message: "Only web hooks can be tried",
      });
    }

    const user = await ctx.env.data.users.get(tenantId, user_id);
    if (!user) {
      throw new HTTPException(404, { message: "User not found" });
    }

    const result = await invokeWebHook(ctx, hook, {
      tenant_id: tenantId,
      user,
      trigger_id: hook.trigger_id,
    });

    await logMessage(ctx, tenantId, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: `Try a Hook (${hook_id})`,
      targetType: "hook",
      targetId: hook_id,
    });

    return ctx.json(result);
  },
});

export const hooksRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([
  getRoot,
  postRoot,
  patchByHook_id,
  getByHook_id,
  deleteByHook_id,
  tryByHook_id,
] as const);
