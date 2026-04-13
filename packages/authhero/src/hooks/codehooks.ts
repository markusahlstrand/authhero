import { Context } from "hono";
import { DataAdapters, Hook, LogTypes } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { HookEvent, OnExecuteCredentialsExchangeAPI } from "../types/Hooks";
import { logMessage } from "../helpers/logging";

// Type guard for code hooks
type CodeHook = Extract<Hook, { code_id: string }>;

export function isCodeHook(hook: Hook): hook is CodeHook {
  return "code_id" in hook;
}

/**
 * Build a serializable event object from a HookEvent.
 * Strips the `ctx` property (Hono context) which cannot be serialized,
 * and returns a plain JSON-compatible object.
 */
export function buildSerializableEvent(
  event: HookEvent,
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

/**
 * Execute a code hook by fetching the code from the database,
 * running it through the code executor, and replaying API calls.
 */
export async function handleCodeHook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
  hook: { code_id: string; hook_id: string },
  event: HookEvent,
  triggerId: string,
  api: Record<string, any>,
): Promise<void> {
  const codeExecutor = ctx.env.codeExecutor;
  if (!codeExecutor) {
    return;
  }

  const tenant_id = ctx.var.tenant_id || ctx.req.header("tenant-id");
  if (!tenant_id) {
    return;
  }

  const hookCode = await data.hookCode.get(tenant_id, hook.code_id);
  if (!hookCode) {
    logMessage(ctx, tenant_id, {
      type: LogTypes.FAILED_HOOK,
      description: `Code hook ${hook.hook_id}: code_id ${hook.code_id} not found`,
    });
    return;
  }

  const serializableEvent = buildSerializableEvent(event, hookCode.secrets);

  const result = await codeExecutor.execute({
    code: hookCode.code,
    hookCodeId: hook.code_id,
    triggerId,
    event: serializableEvent,
    timeoutMs: 5000,
  });

  if (!result.success) {
    logMessage(ctx, tenant_id, {
      type: LogTypes.FAILED_HOOK,
      description: `Code hook ${hook.hook_id} failed: ${result.error}`,
    });
    return;
  }

  // Replay the recorded API calls against the real api objects
  replayApiCalls(result.apiCalls, api);
}

/**
 * Execute code hooks for the credentials-exchange trigger.
 * Filters enabled code hooks from the provided hooks list and executes them.
 */
export async function handleCredentialsExchangeCodeHooks(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  hooks: any[],
  event: HookEvent,
  api: OnExecuteCredentialsExchangeAPI,
): Promise<void> {
  const codeHooks = hooks.filter((h: any) => h.enabled && isCodeHook(h));

  for (const hook of codeHooks) {
    if (!isCodeHook(hook)) continue;
    try {
      await handleCodeHook(
        ctx,
        ctx.env.data,
        hook,
        event,
        "credentials-exchange",
        api as unknown as Record<string, any>,
      );
    } catch (err) {
      const tenant_id = ctx.var.tenant_id || ctx.req.header("tenant-id");
      if (tenant_id) {
        logMessage(ctx, tenant_id, {
          type: LogTypes.FAILED_HOOK,
          description: `Code hook ${hook.hook_id} threw: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }
}
