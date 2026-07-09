import { Context } from "hono";
import { nanoid } from "nanoid";
import {
  AuditEventInsert,
  LogTypes,
  OutboxEventInsert,
  User,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { waitUntil } from "./wait-until";
import { invokeHooks } from "../hooks/webhooks";
import { stripInternalUserFields } from "./hook-user-payload";

type HookCtx = Context<{ Bindings: Bindings; Variables: Variables }>;

/**
 * Whether the outbox is configured for this request. When false, hook dispatch
 * falls back to inline webhook invocation (no retry / dead-letter).
 */
export function outboxEnabled(ctx: HookCtx): boolean {
  return Boolean(ctx.env.outbox?.enabled && ctx.env.data.outbox);
}

/**
 * Build a `hook.{triggerId}` outbox event with a caller-assigned id, or
 * `undefined` when the outbox is not configured (the caller then falls back to
 * inline dispatch via {@link dispatchPostHookInline}).
 *
 * The returned event is meant to be handed to an event-emitting user write
 * (`rawCreate` / `remove`) via its `outboxEvents` option so it commits in the
 * same atomic unit as the business row (issue #1057). Because the id is fixed
 * up front, the caller can relay it with {@link relayOutboxEvent} once the
 * write commits without needing a return value from the adapter.
 */
export function buildPostHookEvent(
  ctx: HookCtx,
  tenantId: string,
  triggerId: string,
  user: User,
): OutboxEventInsert | undefined {
  if (!outboxEnabled(ctx)) {
    return undefined;
  }

  const event: AuditEventInsert = {
    tenant_id: tenantId,
    event_type: `hook.${triggerId}`,
    // Hook-dispatch events are filtered out by LogsDestination (by event_type
    // prefix), so `log_type` is essentially inert here. Use a neutral value
    // so the zod refine on LogType still accepts it.
    log_type: LogTypes.SUCCESS_API_OPERATION,
    description: `Enqueued ${triggerId} hook dispatch`,
    category: "system",
    actor: {
      type: ctx.var.user_id
        ? "admin"
        : ctx.var.client_id
          ? "client_credentials"
          : "system",
      id: ctx.var.user_id || undefined,
      client_id: ctx.var.client_id || undefined,
    },
    target: {
      type: "user",
      id: user.user_id,
      after: stripInternalUserFields(user) as unknown as Record<
        string,
        unknown
      >,
    },
    request: {
      method: ctx.req.method,
      path: ctx.req.path,
      ip: ctx.var.ip || "",
      user_agent: ctx.var.useragent || undefined,
    },
    hostname: ctx.var.host || "",
    auth0_client: ctx.var.auth0_client,
    timestamp: new Date().toISOString(),
  };

  return { ...event, id: nanoid() };
}

/**
 * Relay an outbox event that has already been persisted (atomically with its
 * business write) so the outbox middleware picks it up for delivery. Mirrors
 * the synchronous-push pattern used by `logMessage`: the id is pushed onto
 * `ctx.var.outboxEventPromises`, which the outbox middleware drains and hands
 * to `processOutboxEvents`.
 */
export function relayOutboxEvent(ctx: HookCtx, id: string): void {
  const existing = ctx.var.outboxEventPromises || [];
  existing.push(Promise.resolve(id));
  ctx.set("outboxEventPromises", existing);
}

/**
 * Fallback dispatch for when the outbox is not configured: invoke the
 * post-hook webhooks inline (fire-and-forget via `waitUntil`). No retry /
 * dead-letter support in this mode — configure the outbox for durable
 * delivery.
 */
export function dispatchPostHookInline(
  ctx: HookCtx,
  tenantId: string,
  triggerId: string,
  user: User,
): void {
  waitUntil(ctx, dispatchInline(ctx, tenantId, triggerId, user));
}

async function dispatchInline(
  ctx: HookCtx,
  tenantId: string,
  triggerId: string,
  user: User,
): Promise<void> {
  const { hooks } = await ctx.env.data.hooks.list(tenantId);
  const filtered = hooks.filter(
    (h: any) => h.enabled && h.trigger_id === triggerId && "url" in h,
  );
  if (filtered.length > 0) {
    await invokeHooks(ctx, filtered, {
      tenant_id: tenantId,
      user: stripInternalUserFields(user),
      trigger_id: triggerId,
    });
  }

  // Mirror the finalizer destination used by the outbox path: once the
  // post-user-registration webhooks have been delivered (or there were none),
  // flag the user as complete so `postUserLoginHook` doesn't re-enqueue the
  // event on every subsequent login.
  if (triggerId === "post-user-registration" && user.user_id) {
    try {
      await ctx.env.data.users.update(tenantId, user.user_id, {
        registration_completed_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error(
        "Failed to mark registration_completed_at on inline dispatch:",
        err,
      );
    }
  }
}
