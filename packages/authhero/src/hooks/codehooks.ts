import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  ActionExecutionResult,
  ActionExecutionStatus,
  CodeExecutionLog,
  CodeExecutor,
  DataAdapters,
  Hook,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { HookEvent, OnExecuteCredentialsExchangeAPI } from "../types/Hooks";
import { EnrichedClient } from "../helpers/client";

/**
 * Auth0 uses `post-login` for what we internally call `post-user-login`.
 * Normalize when writing execution records so the public API matches Auth0.
 */
export function toAuth0TriggerId(internal: string): string {
  if (internal === "post-user-login") return "post-login";
  return internal;
}

/**
 * The subset of `DataAdapters` needed to resolve and run a code hook and to
 * persist its execution record. Narrowed so `CodeHookDestination` and the cron
 * `createDefaultDestinations` helper can construct it without depending on the
 * full adapter surface.
 */
export type CodeHookData = Pick<
  DataAdapters,
  "hooks" | "actions" | "hookCode" | "actionExecutions" | "multiTenancyConfig"
>;

// Type guard for code hooks
type CodeHook = Extract<Hook, { code_id: string }>;

export function isCodeHook(hook: Hook): hook is CodeHook {
  return "code_id" in hook;
}

/**
 * Loosened event shape accepted by `buildSerializableEvent` / `executeCodeHook`.
 *
 * The inline hook call sites pass a full `HookEvent`. The `CodeHookDestination`
 * (which runs from the outbox relay, after the request has closed) has no live
 * `ctx` and reconstructs the event from the persisted audit event, so `user`
 * and `request` arrive as already-serialized `unknown` values. Both are
 * assignable to this type.
 */
export type CodeHookEventInput = {
  ctx?: unknown;
  client?: Pick<
    EnrichedClient,
    "client_id" | "name" | "client_metadata"
  > | null;
} & Record<string, unknown>;

/**
 * Build a serializable event object from a HookEvent.
 * Strips the `ctx` property (Hono context) which cannot be serialized,
 * and returns a plain JSON-compatible object.
 */
export function buildSerializableEvent(
  event: CodeHookEventInput,
  secrets?: Record<string, string>,
): Record<string, unknown> {
  const { ctx, client, ...rest } = event;

  return {
    ...rest,
    client: client
      ? {
          client_id: client.client_id,
          name: client.name,
          metadata: client.client_metadata,
        }
      : undefined,
    secrets: secrets || {},
  };
}

/**
 * Replay recorded API calls from code hook execution against real API objects.
 * Handles calls like "accessToken.setCustomClaim" by navigating the api object.
 */
export function replayApiCalls(
  apiCalls: Array<{ method: string; args: unknown[] }>,
  api: Record<string, any>,
): void {
  for (const call of apiCalls) {
    const parts = call.method.split(".");
    if (parts.length !== 2) continue;

    const namespace = parts[0]!;
    const method = parts[1]!;
    if (api[namespace] && typeof api[namespace][method] === "function") {
      api[namespace][method](...call.args);
    }
  }
}

type ResolvedCode = {
  code: string;
  name: string;
  secrets?: Record<string, string>;
};

function secretsToMap(
  secrets: Array<{ name: string; value?: string }> | undefined,
): Record<string, string> {
  if (!secrets) return {};
  return secrets.reduce<Record<string, string>>((acc, secret) => {
    if (secret.value !== undefined) acc[secret.name] = secret.value;
    return acc;
  }, {});
}

async function loadCodeForHook(
  data: Pick<DataAdapters, "actions" | "hookCode" | "multiTenancyConfig">,
  tenant_id: string,
  code_id: string,
): Promise<ResolvedCode | null> {
  const action = await data.actions.get(tenant_id, code_id);
  if (action) {
    // Inherited stub: read `code` from the control-plane system action that
    // matches by name. Local secrets win; upstream secrets fill in any names
    // the tenant hasn't overridden. If the upstream lookup fails, the local
    // `code` (which may be a stale snapshot or empty) is used as-is.
    //
    // The control-plane tenant is resolved per-tenant when a resolver is
    // configured, so tenants that opted out of inheritance don't pull in
    // upstream code.
    let inheritFromTenantId = data.multiTenancyConfig?.controlPlaneTenantId;
    if (action.inherit && data.multiTenancyConfig?.resolveControlPlane) {
      const resolved = await data.multiTenancyConfig.resolveControlPlane({
        tenant_id,
      });
      inheritFromTenantId = resolved?.tenantId;
    }
    if (
      action.inherit &&
      inheritFromTenantId &&
      inheritFromTenantId !== tenant_id
    ) {
      // Escape backslashes and quotes so the quoted phrase survives names
      // containing punctuation (colons, parens, etc. are fine inside a
      // quoted Lucene phrase; only `\` and `"` need escaping). We still
      // exact-match the result client-side as a defensive backstop.
      const quoted = action.name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const { actions: matches } = await data.actions.list(
        inheritFromTenantId,
        { q: `name:"${quoted}"`, per_page: 5 },
      );
      const upstream = matches.find(
        (a) => a.name === action.name && a.is_system,
      );
      if (upstream) {
        return {
          code: upstream.code,
          name: action.name,
          secrets: {
            ...secretsToMap(upstream.secrets),
            ...secretsToMap(action.secrets),
          },
        };
      }
    }
    return {
      code: action.code,
      name: action.name,
      secrets: secretsToMap(action.secrets),
    };
  }

  const hookCode = await data.hookCode.get(tenant_id, code_id);
  if (hookCode) {
    // Legacy hookCode entries have no display name — fall back to the id.
    return { code: hookCode.code, name: code_id, secrets: hookCode.secrets };
  }

  return null;
}

export type HandleCodeHookOutcome = {
  result: ActionExecutionResult;
  logs: CodeExecutionLog[];
  /** True if api.access.deny was recorded by the executor. */
  denied: boolean;
};

/**
 * Core code-hook execution, decoupled from the Hono request `ctx`.
 *
 * Given an explicit executor, data adapter, and tenant, fetches the code,
 * runs it, and replays the recorded API calls against `api`. Shared by the
 * inline `handleCodeHook` wrapper (request-time) and by `CodeHookDestination`
 * (outbox relay, after the request has closed).
 *
 * Always returns an outcome — including a `code_not_found` / `execution_failed`
 * outcome — so the caller can persist an `action_executions` record. It only
 * throws for `api.access.deny`, which surfaces as a thrown `HTTPException` from
 * the replayed API call; callers that must abort the flow catch it.
 *
 * `idempotencyKey`, when set, is exposed to user code as `event.idempotency_key`.
 * The outbox is at-least-once, so a retried hook event re-runs the code; authors
 * performing non-idempotent side effects can dedupe on this key.
 */
export async function executeCodeHook(params: {
  codeExecutor: CodeExecutor;
  data: CodeHookData;
  tenantId: string;
  hook: { code_id: string; hook_id?: string };
  event: CodeHookEventInput;
  triggerId: string;
  api: Record<string, any>;
  idempotencyKey?: string;
}): Promise<HandleCodeHookOutcome> {
  const { codeExecutor, data, tenantId, hook, event, triggerId, api } = params;

  const codeRecord = await loadCodeForHook(data, tenantId, hook.code_id);
  const started_at = new Date().toISOString();

  if (!codeRecord) {
    return {
      result: {
        action_name: hook.code_id,
        error: {
          id: "code_not_found",
          msg: `code_id ${hook.code_id} not found`,
        },
        started_at,
        ended_at: new Date().toISOString(),
      },
      logs: [],
      denied: false,
    };
  }

  const serializableEvent = buildSerializableEvent(event, codeRecord.secrets);
  if (params.idempotencyKey) {
    serializableEvent.idempotency_key = params.idempotencyKey;
  }

  const execResult = await codeExecutor.execute({
    code: codeRecord.code,
    hookCodeId: hook.code_id,
    triggerId,
    event: serializableEvent,
    timeoutMs: 5000,
  });

  const ended_at = new Date().toISOString();

  if (!execResult.success) {
    return {
      result: {
        action_name: codeRecord.name,
        error: {
          id: "execution_failed",
          msg: execResult.error || "Unknown error",
        },
        started_at,
        ended_at,
      },
      logs: execResult.logs ?? [],
      denied: false,
    };
  }

  // Replay the recorded API calls against the real api objects. This is where
  // api.access.deny fires (throws), where setCustomClaim mutates the real
  // token, etc.
  replayApiCalls(execResult.apiCalls, api);

  const denied = execResult.apiCalls.some((c) => c.method === "access.deny");

  return {
    result: {
      action_name: codeRecord.name,
      error: null,
      started_at,
      ended_at,
    },
    logs: execResult.logs ?? [],
    denied,
  };
}

/**
 * Execute a code hook by fetching the code from the database, running it
 * through the code executor, and replaying API calls against the real api
 * object.
 *
 * Thin request-time wrapper over `executeCodeHook` that resolves the executor
 * and tenant from `ctx`. Returns `null` when the code executor is unavailable
 * or the tenant can't be resolved — the caller decides whether to surface that.
 */
export async function handleCodeHook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
  hook: { code_id: string; hook_id: string },
  event: HookEvent,
  triggerId: string,
  api: Record<string, any>,
): Promise<HandleCodeHookOutcome | null> {
  const codeExecutor = ctx.env.codeExecutor;
  if (!codeExecutor) {
    return null;
  }

  const tenant_id = ctx.var.tenant_id || ctx.req.header("tenant-id");
  if (!tenant_id) {
    return null;
  }

  return executeCodeHook({
    codeExecutor,
    data,
    tenantId: tenant_id,
    hook,
    event,
    triggerId,
    api,
  });
}

/**
 * Aggregate per-action outcomes into an Auth0-shape execution record and
 * persist it via the adapter. Returns the generated execution_id (uuid)
 * so the caller can embed it in the surrounding tenant log.
 */
export async function persistActionExecution(
  data: Pick<DataAdapters, "actionExecutions">,
  tenant_id: string,
  triggerId: string,
  outcomes: HandleCodeHookOutcome[],
): Promise<string | null> {
  if (outcomes.length === 0) return null;

  const id = crypto.randomUUID();
  const status: ActionExecutionStatus = outcomes.some((o) => o.denied)
    ? "canceled"
    : outcomes.some((o) => o.result.error)
      ? "partial"
      : "final";

  const logs = outcomes
    .filter((o) => o.logs.length > 0)
    .map((o) => ({ action_name: o.result.action_name, lines: o.logs }));

  await data.actionExecutions.create(tenant_id, {
    id,
    trigger_id: toAuth0TriggerId(triggerId),
    status,
    results: outcomes.map((o) => o.result),
    logs: logs.length > 0 ? logs : undefined,
  });

  return id;
}

/**
 * Execute code hooks for the credentials-exchange trigger.
 * Filters enabled code hooks from the provided hooks list and executes them.
 *
 * Returns the persisted `execution_id` so the caller can embed it in the
 * surrounding tenant log (the standard token-exchange log entry). The
 * execution record itself follows Auth0's shape — see
 * GET /api/v2/actions/executions/:id.
 */
export async function handleCredentialsExchangeCodeHooks(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  hooks: any[],
  event: HookEvent,
  api: OnExecuteCredentialsExchangeAPI,
): Promise<string | null> {
  const tenant_id = ctx.var.tenant_id || ctx.req.header("tenant-id");
  if (!tenant_id) return null;

  const codeHooks: CodeHook[] = (hooks as Hook[]).filter(
    (h): h is CodeHook => !!(h as any).enabled && isCodeHook(h),
  );
  const outcomes: HandleCodeHookOutcome[] = [];

  for (const hook of codeHooks) {
    try {
      const outcome = await handleCodeHook(
        ctx,
        ctx.env.data,
        hook,
        event,
        "credentials-exchange",
        api as unknown as Record<string, any>,
      );
      if (outcome) outcomes.push(outcome);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // api.access.deny throws HTTPException — record as denied so the
      // execution is persisted as "canceled" rather than "partial".
      const denied = err instanceof HTTPException;
      outcomes.push({
        result: {
          action_name: hook.code_id,
          error: {
            id: denied ? "access_denied" : "execution_threw",
            msg: message,
          },
          started_at: new Date().toISOString(),
          ended_at: new Date().toISOString(),
        },
        logs: [],
        denied,
      });
    }
  }

  return persistActionExecution(
    ctx.env.data,
    tenant_id,
    "credentials-exchange",
    outcomes,
  );
}
