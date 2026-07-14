import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { actionSchema, LogTypes } from "@authhero/adapter-interfaces";
import { logMessage } from "../../helpers/logging";
import { HTTPException } from "hono/http-exception";
import { generateHookId } from "../../utils/entity-id";

import { defineRoute } from "../../utils/define-route";
import { requireTenantId } from "./helpers";
// Map Auth0 trigger IDs to internal trigger IDs
const TRIGGER_ID_MAP: Record<string, string> = {
  "post-login": "post-user-login",
  "credentials-exchange": "credentials-exchange",
  "pre-user-registration": "pre-user-registration",
  "post-user-registration": "post-user-registration",
};

// Reverse map: internal -> Auth0
const REVERSE_TRIGGER_ID_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(TRIGGER_ID_MAP).map(([auth0, internal]) => [internal, auth0]),
);

function toInternalTriggerId(triggerId: string): string {
  return TRIGGER_ID_MAP[triggerId] || triggerId;
}

function toAuth0TriggerId(triggerId: string): string {
  return REVERSE_TRIGGER_ID_MAP[triggerId] || triggerId;
}

// Auth0's PATCH /actions/triggers/{id}/bindings sends ref as { type, value }
// — accept that shape. Keep id/name fields for backwards-compatibility with
// older callers.
const bindingRefSchema = z.object({
  type: z.enum(["action_id", "action_name"]).optional(),
  value: z.string().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
});

const bindingInputSchema = z.object({
  ref: bindingRefSchema,
  display_name: z.string().optional(),
});

const bindingResponseSchema = z.object({
  id: z.string(),
  trigger_id: z.string(),
  display_name: z.string(),
  action: actionSchema,
  created_at: z.string(),
  updated_at: z.string(),
});

const bindingsResponseSchema = z.object({
  bindings: z.array(bindingResponseSchema),
});
const getByTriggerIdBindings = defineRoute({
  route: createRoute({
    tags: ["actions"],
    method: "get",
    path: "/{triggerId}/bindings",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      params: z.object({
        triggerId: z.string(),
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
            schema: bindingsResponseSchema,
          },
        },
        description: "Trigger bindings",
      },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const { triggerId } = ctx.req.valid("param");
    const internalTriggerId = toInternalTriggerId(triggerId);

    // Get all hooks for this trigger that are code hooks
    const hooks = await ctx.env.data.hooks.list(tenantId, {
      q: `trigger_id:"${internalTriggerId}"`,
      per_page: 100,
    });

    // Filter to code hooks only and sort by priority (higher priority first)
    const codeHooks = hooks.hooks
      .filter((h: any) => "code_id" in h && h.code_id)
      .sort((a: any, b: any) => (b.priority || 0) - (a.priority || 0));

    // Fetch the action for each code hook
    const bindings: any[] = [];
    for (const hook of codeHooks) {
      const codeId = (hook as any).code_id;
      const action = await ctx.env.data.actions.get(tenantId, codeId);
      if (action) {
        bindings.push({
          id: hook.hook_id,
          trigger_id: toAuth0TriggerId(hook.trigger_id),
          display_name: action.name,
          action: {
            ...action,
            secrets: action.secrets?.map((s) => ({ name: s.name })),
          },
          created_at: hook.created_at,
          updated_at: hook.updated_at,
        });
      }
    }

    return ctx.json({ bindings });
  },
});

const patchByTriggerIdBindings = defineRoute({
  route: createRoute({
    tags: ["actions"],
    method: "patch",
    path: "/{triggerId}/bindings",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      params: z.object({
        triggerId: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              bindings: z.array(bindingInputSchema),
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
            schema: bindingsResponseSchema,
          },
        },
        description: "Updated trigger bindings",
      },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const { triggerId } = ctx.req.valid("param");
    const { bindings } = ctx.req.valid("json");
    const internalTriggerId = toInternalTriggerId(triggerId);

    // Resolve and validate every binding (action exists, ref shape valid)
    // before mutating any state — partial removal of existing hooks
    // followed by a 4xx would leave the trigger in an inconsistent state.
    const resolved: Array<{
      binding: (typeof bindings)[number];
      actionId: string;
      action: NonNullable<Awaited<ReturnType<typeof ctx.env.data.actions.get>>>;
    }> = [];
    for (let i = 0; i < bindings.length; i++) {
      const binding = bindings[i]!;
      let actionId = binding.ref.id;
      if (!actionId && binding.ref.type === "action_id" && binding.ref.value) {
        actionId = binding.ref.value;
      } else if (
        !actionId &&
        binding.ref.type === "action_name" &&
        binding.ref.value
      ) {
        // Look up action by exact name. The lucene-style q parser used by
        // actions.list doesn't support escapes, so a name containing `"`
        // would unbalance tokenization. Page through actions and filter in
        // JS for an exact match.
        const refName = binding.ref.value;
        const per_page = 100;
        let lookupPage = 0;
        while (true) {
          const matches = await ctx.env.data.actions.list(tenantId, {
            page: lookupPage,
            per_page,
            include_totals: false,
          });
          const found = matches.actions.find((a) => a.name === refName);
          if (found) {
            actionId = found.id;
            break;
          }
          if (matches.actions.length < per_page) break;
          lookupPage++;
        }
      }

      if (!actionId) {
        throw new HTTPException(400, {
          message: `Binding at index ${i} must reference an action via ref.id or ref.value`,
        });
      }

      const action = await ctx.env.data.actions.get(tenantId, actionId);
      if (!action) {
        throw new HTTPException(404, {
          message: `Action ${actionId} not found`,
        });
      }

      resolved.push({ binding, actionId, action });
    }

    // All bindings valid — safe to swap out existing code hooks.
    const existingHooks = await ctx.env.data.hooks.list(tenantId, {
      q: `trigger_id:"${internalTriggerId}"`,
      per_page: 100,
    });

    for (const hook of existingHooks.hooks) {
      if ("code_id" in hook && hook.code_id) {
        await ctx.env.data.hooks.remove(tenantId, hook.hook_id);
      }
    }

    const resultBindings: any[] = [];
    for (let i = 0; i < resolved.length; i++) {
      const { binding, actionId, action } = resolved[i]!;

      // Create a hook binding with priority based on array position
      // Higher index = lower priority (first in array executes first)
      const hook = await ctx.env.data.hooks.create(tenantId, {
        hook_id: generateHookId(),
        trigger_id: internalTriggerId as any,
        code_id: actionId,
        enabled: true,
        synchronous: true,
        priority: resolved.length - i,
      });

      resultBindings.push({
        id: hook.hook_id,
        trigger_id: toAuth0TriggerId(hook.trigger_id),
        display_name: binding.display_name || action.name,
        action: {
          ...action,
          secrets: action.secrets?.map((s) => ({ name: s.name })),
        },
        created_at: hook.created_at,
        updated_at: hook.updated_at,
      });
    }

    await logMessage(ctx, tenantId, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: `Update trigger bindings for ${triggerId}`,
      targetType: "action",
    });

    return ctx.json({ bindings: resultBindings });
  },
});

export const actionTriggersRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([getByTriggerIdBindings, patchByTriggerIdBindings] as const);
