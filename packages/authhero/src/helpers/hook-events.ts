import { Context } from "hono";
import { AuditEventInsert, LogTypes, User } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { waitUntil } from "./wait-until";
import { invokeHooks } from "../hooks/webhooks";
import { stripInternalUserFields } from "./hook-user-payload";

/**
 * Enqueue a `hook.{triggerId}` event to the outbox so the `WebhookDestination`
 * (and future `CodeHookDestination`) can dispatch the hook asynchronously with
 * retries instead of firing inline while the request is being served.
 *
 * Mirrors the synchronous-push pattern used by `logMessage`: the promise from
 * `outbox.create` is pushed onto `ctx.var.outboxEventPromises` so the outbox
 * middleware can await it in its finally block and then relay the resulting
 * event IDs.
 *
 * When the outbox is not configured, falls back to inline webhook invocation
 * (via `waitUntil`) so tenants without outbox still receive webhook calls.
 */
export function enqueuePostHookEvent(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
  triggerId: string,
  user: User,
): void {
  if (!ctx.env.outbox?.enabled || !ctx.env.data.outbox) {
    // Outbox not configured: invoke webhooks inline (fire-and-forget via
    // waitUntil). No retry + dead-letter support in this mode — configure
    // the outbox to get durable delivery.
    waitUntil(ctx, dispatchInline(ctx, tenantId, triggerId, user));
    return;
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

  const eventPromise = ctx.env.data.outbox.create(tenantId, event);
  const existing = ctx.var.outboxEventPromises || [];
  existing.push(eventPromise);
  ctx.set("outboxEventPromises", existing);
}

async function dispatchInline(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
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
