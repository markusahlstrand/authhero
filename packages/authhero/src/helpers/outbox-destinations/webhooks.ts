import { AuditEvent, Hook, HooksAdapter } from "@authhero/adapter-interfaces";
import { EventDestination } from "../outbox-relay";
import type { WebhookInvoker } from "../../types/AuthHeroConfig";

const HOOK_EVENT_PREFIX = "hook.";
const DEFAULT_DELIVERY_TIMEOUT_MS = 10_000;
const DEFAULT_SCOPE = "webhook";

/**
 * Mints a Bearer token for a given tenant. `scope` is forwarded so a custom
 * `webhookInvoker` can request a non-default scope for its outbound call.
 */
export type GetServiceToken = (
  tenantId: string,
  scope?: string,
) => Promise<string>;

interface WebhookInvocation {
  eventId: string;
  tenantId: string;
  triggerId: string;
  payload: {
    tenant_id: string;
    trigger_id: string;
    user?: unknown;
    request?: unknown;
  };
}

export interface WebhookDestinationOptions {
  timeoutMs?: number;
  /**
   * Replaces the default HTTP invoker. When set, each matching webhook is
   * dispatched by calling `webhookInvoker({ hook, data, tenant_id,
   * createServiceToken })` instead of issuing a raw `fetch` with a Bearer
   * token. `createServiceToken(scope?)` lazily mints a token bound to the
   * invocation's tenant, matching the shape passed to the legacy inline
   * dispatcher in `hooks/webhooks.ts`.
   */
  webhookInvoker?: WebhookInvoker;
}

/**
 * Delivers `hook.*` outbox events to HTTP webhooks configured for the matching
 * trigger_id. Each POST includes `Idempotency-Key: {event.id}` so downstream
 * webhook handlers can dedupe if the outbox retries.
 *
 * The destination is constructed per-request (via `outboxMiddleware`'s
 * `getDestinations(ctx)` factory) so it can close over a ctx-bound service
 * token generator. The same class is also used by the cron `runOutboxRelay`
 * helper — a consumer's `webhookInvoker` configured via `init()` propagates
 * to both paths so cron-drained deliveries don't diverge from per-request
 * ones.
 */
export class WebhookDestination implements EventDestination {
  name = "webhooks";
  private hooks: HooksAdapter;
  private getServiceToken: GetServiceToken;
  private timeoutMs: number;
  private webhookInvoker?: WebhookInvoker;

  constructor(
    hooks: HooksAdapter,
    getServiceToken: GetServiceToken,
    options: WebhookDestinationOptions = {},
  ) {
    this.hooks = hooks;
    this.getServiceToken = getServiceToken;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_DELIVERY_TIMEOUT_MS;
    this.webhookInvoker = options.webhookInvoker;
  }

  accepts(event: AuditEvent): boolean {
    return event.event_type.startsWith(HOOK_EVENT_PREFIX);
  }

  transform(event: AuditEvent): WebhookInvocation {
    const triggerId = event.event_type.slice(HOOK_EVENT_PREFIX.length);
    return {
      eventId: event.id,
      tenantId: event.tenant_id,
      triggerId,
      payload: {
        tenant_id: event.tenant_id,
        trigger_id: triggerId,
        user: event.target?.after,
        request: event.request,
      },
    };
  }

  async deliver(events: WebhookInvocation[]): Promise<void> {
    for (const invocation of events) {
      const { hooks } = await this.hooks.list(invocation.tenantId);
      const webhooks = hooks.filter(
        (h) =>
          h.enabled && h.trigger_id === invocation.triggerId && "url" in h,
      ) as Array<Hook & { url: string }>;
      if (webhooks.length === 0) continue;

      for (const hook of webhooks) {
        if (this.webhookInvoker) {
          await this.invokeCustom(hook, invocation);
        } else {
          await this.invokeDefault(hook, invocation);
        }
      }
    }
  }

  private async invokeCustom(
    hook: Hook & { url: string },
    invocation: WebhookInvocation,
  ): Promise<void> {
    const invoker = this.webhookInvoker!;
    const boundCreateServiceToken = (scope: string = DEFAULT_SCOPE) =>
      this.getServiceToken(invocation.tenantId, scope);

    const response = await invoker({
      hook,
      data: invocation.payload as unknown as Record<string, unknown>,
      tenant_id: invocation.tenantId,
      createServiceToken: boundCreateServiceToken,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Webhook ${hook.hook_id} (${invocation.triggerId}) returned ${response.status}: ${body.slice(0, 256)}`,
      );
    }
  }

  private async invokeDefault(
    hook: Hook & { url: string },
    invocation: WebhookInvocation,
  ): Promise<void> {
    const token = await this.getServiceToken(
      invocation.tenantId,
      DEFAULT_SCOPE,
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(hook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": invocation.eventId,
        },
        body: JSON.stringify(invocation.payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Webhook ${hook.hook_id} (${invocation.triggerId}) returned ${response.status}: ${body.slice(0, 256)}`,
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
