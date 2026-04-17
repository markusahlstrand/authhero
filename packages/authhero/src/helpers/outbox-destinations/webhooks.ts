import { AuditEvent, HooksAdapter } from "@authhero/adapter-interfaces";
import { EventDestination } from "../outbox-relay";

const HOOK_EVENT_PREFIX = "hook.";
const DEFAULT_DELIVERY_TIMEOUT_MS = 10_000;

type GetServiceToken = (tenantId: string) => Promise<string>;

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

/**
 * Delivers `hook.*` outbox events to HTTP webhooks configured for the matching
 * trigger_id. Each POST includes `Idempotency-Key: {event.id}` so downstream
 * webhook handlers can dedupe if the outbox retries.
 *
 * The destination is constructed per-request (via `outboxMiddleware`'s
 * `getDestinations(ctx)` factory) so it can close over a ctx-bound service
 * token generator.
 */
export class WebhookDestination implements EventDestination {
  name = "webhooks";
  private hooks: HooksAdapter;
  private getServiceToken: GetServiceToken;
  private timeoutMs: number;

  constructor(
    hooks: HooksAdapter,
    getServiceToken: GetServiceToken,
    options: { timeoutMs?: number } = {},
  ) {
    this.hooks = hooks;
    this.getServiceToken = getServiceToken;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_DELIVERY_TIMEOUT_MS;
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
        (h: any) =>
          h.enabled && h.trigger_id === invocation.triggerId && "url" in h,
      );
      if (webhooks.length === 0) continue;

      const token = await this.getServiceToken(invocation.tenantId);

      for (const hook of webhooks as Array<{ hook_id: string; url: string }>) {
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
  }
}
