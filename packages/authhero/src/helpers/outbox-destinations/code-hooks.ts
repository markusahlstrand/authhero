import { AuditEvent, CodeExecutor, Hook } from "@authhero/adapter-interfaces";
import { EventDestination } from "../outbox-relay";
import {
  CodeHookData,
  CodeHookEventInput,
  executeCodeHook,
  HandleCodeHookOutcome,
  isCodeHook,
  persistActionExecution,
} from "../../hooks/codehooks";

const HOOK_EVENT_PREFIX = "hook.";

interface CodeHookInvocation {
  eventId: string;
  tenantId: string;
  triggerId: string;
  /** Serialized user snapshot from the audit event (`target.after`). */
  user?: unknown;
  /** Serialized request context from the audit event. */
  request?: unknown;
}

/**
 * Delivers `hook.*` outbox events to tenant-authored **code hooks** (actions)
 * for the matching `trigger_id`. Runs alongside `WebhookDestination` — both
 * accept the same `hook.*` events — so a single registration/deletion event
 * fans out to webhooks *and* code hooks. The fan-out is not retried
 * independently: the relay retries the whole outbox event, running its
 * destinations in order and stopping at the first failure, so a code-hook
 * failure here causes earlier destinations (e.g. webhooks) to run again on the
 * retry. Every destination on the event must therefore be idempotent.
 *
 * Reliability model: unlike the previous inline execution (best-effort,
 * at-most-once, failures logged and dropped), code hooks delivered here are
 * **at-least-once**. If any code hook for the trigger fails, `deliver` throws
 * so the relay retries the whole event with backoff and, after `maxRetries`,
 * dead-letters it. A retry re-runs every code hook for the trigger, so the
 * event id is passed to user code as `event.idempotency_key` for dedupe.
 *
 * Must be listed AFTER `WebhookDestination` and BEFORE
 * `RegistrationFinalizerDestination` so `registration_completed_at` is only
 * flipped on a pass where every webhook *and* code hook succeeded.
 *
 * Constructed per-request (via `getDestinations(ctx)`) so it can close over
 * `ctx.env.codeExecutor`. The same class is used by the cron `drainOutbox`
 * safety net when a `codeExecutor` is supplied to `createDefaultDestinations`.
 * When no executor is configured, code hooks cannot run (nor be deployed), so
 * `deliver` is a no-op success — matching the inline `handleCodeHook` which
 * returns `null` without an executor.
 */
export class CodeHookDestination implements EventDestination {
  name = "code-hooks";
  private data: CodeHookData;
  private codeExecutor?: CodeExecutor;

  constructor(data: CodeHookData, codeExecutor?: CodeExecutor) {
    this.data = data;
    this.codeExecutor = codeExecutor;
  }

  accepts(event: AuditEvent): boolean {
    return event.event_type.startsWith(HOOK_EVENT_PREFIX);
  }

  transform(event: AuditEvent): CodeHookInvocation {
    return {
      eventId: event.id,
      tenantId: event.tenant_id,
      triggerId: event.event_type.slice(HOOK_EVENT_PREFIX.length),
      user: event.target?.after,
      request: event.request,
    };
  }

  async deliver(invocations: CodeHookInvocation[]): Promise<void> {
    const codeExecutor = this.codeExecutor;
    // No executor configured: code hooks can't have been deployed, so there is
    // nothing to run. Treat as delivered so the event isn't retried forever.
    if (!codeExecutor) return;

    for (const invocation of invocations) {
      const hooks = await this.listAllHooks(invocation.tenantId);
      const codeHooks = hooks.filter(
        (h) =>
          h.enabled && h.trigger_id === invocation.triggerId && isCodeHook(h),
      );
      if (codeHooks.length === 0) continue;

      const event: CodeHookEventInput = {
        user: invocation.user,
        request: invocation.request,
        tenant: { id: invocation.tenantId },
      };

      const outcomes: HandleCodeHookOutcome[] = [];
      for (const hook of codeHooks) {
        // Re-narrow: `filter` above keeps the array typed as `Hook[]`.
        if (!isCodeHook(hook)) continue;
        try {
          outcomes.push(
            await executeCodeHook({
              codeExecutor,
              data: this.data,
              tenantId: invocation.tenantId,
              hook,
              event,
              triggerId: invocation.triggerId,
              // Post-registration / post-deletion have no token to mutate, so
              // the api surface is empty (matches the inline call sites).
              api: { user: {} },
              idempotencyKey: invocation.eventId,
            }),
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          outcomes.push({
            result: {
              action_name: hook.code_id,
              error: { id: "execution_threw", msg: message },
              started_at: new Date().toISOString(),
              ended_at: new Date().toISOString(),
            },
            logs: [],
            denied: false,
          });
        }
      }

      // Persist the execution record for observability regardless of outcome,
      // then fail the delivery if any hook errored so the relay retries.
      await persistActionExecution(
        this.data,
        invocation.tenantId,
        invocation.triggerId,
        outcomes,
      );

      const failed = outcomes.filter((o) => o.result.error);
      if (failed.length > 0) {
        const summary = failed
          .map((o) => `${o.result.action_name}: ${o.result.error?.msg}`)
          .join("; ");
        throw new Error(
          `${failed.length} code hook(s) failed for ${invocation.triggerId}: ${summary}`,
        );
      }
    }
  }

  /**
   * Fetch every hook for the tenant, paging past the adapter's default page
   * size. `hooks.list` returns only the first page by default, so a tenant with
   * more enabled code hooks than one page would silently skip the rest.
   */
  private async listAllHooks(tenantId: string): Promise<Hook[]> {
    const perPage = 100;
    const all: Hook[] = [];
    for (let page = 0; ; page++) {
      const { hooks } = await this.data.hooks.list(tenantId, {
        page,
        per_page: perPage,
      });
      all.push(...hooks);
      if (hooks.length < perPage) break;
    }
    return all;
  }
}
