import { DataAdapters } from "@authhero/adapter-interfaces";
import { EventDestination } from "./outbox-relay";
import { LogsDestination } from "./outbox-destinations/logs";
import { WebhookDestination } from "./outbox-destinations/webhooks";
import { RegistrationFinalizerDestination } from "./outbox-destinations/registration-finalizer";

export interface CreateDefaultDestinationsConfig {
  /**
   * Data adapter — only the `logs`, `hooks`, and `users` adapters are used
   * by the built-in destinations.
   */
  dataAdapter: Pick<DataAdapters, "logs" | "hooks" | "users">;

  /**
   * Produces a Bearer access token for the given tenant, used when POSTing
   * `hook.*` events to the configured webhook URLs.
   *
   * Required if you want `hook.*` events to be drained. Omit for cron
   * drains that only need to sweep up log events.
   */
  getServiceToken?: (tenantId: string) => Promise<string>;

  /** Webhook HTTP request timeout in ms (default: 10_000). */
  webhookTimeoutMs?: number;
}

/**
 * Build the same array of outbox destinations that authhero's per-request
 * `outboxMiddleware` constructs internally. Intended for consumers that want
 * to run `drainOutbox` from a cron / scheduled handler as a safety net for
 * events that failed per-request delivery.
 *
 * Without this helper, consumers would have to instantiate the destination
 * classes themselves and stay in sync with their ordering and filtering
 * rules (e.g. `RegistrationFinalizerDestination` must come AFTER
 * `WebhookDestination`).
 *
 * @example
 * ```ts
 * // Cloudflare Workers scheduled handler
 * async scheduled(_event, env) {
 *   const destinations = createDefaultDestinations({
 *     dataAdapter,
 *     getServiceToken: async (tenantId) =>
 *       (await mintServiceToken(tenantId, "webhook")).access_token,
 *   });
 *   await drainOutbox(dataAdapter.outbox, destinations);
 *   await cleanupOutbox(dataAdapter.outbox, { retentionDays: 7 });
 * }
 * ```
 */
export function createDefaultDestinations(
  config: CreateDefaultDestinationsConfig,
): EventDestination[] {
  const { dataAdapter, getServiceToken, webhookTimeoutMs } = config;

  const destinations: EventDestination[] = [
    new LogsDestination(dataAdapter.logs),
  ];

  if (getServiceToken) {
    destinations.push(
      new WebhookDestination(dataAdapter.hooks, getServiceToken, {
        timeoutMs: webhookTimeoutMs,
      }),
    );
    // Must come AFTER WebhookDestination so the registration-completed flag
    // only flips once webhook delivery has actually succeeded.
    destinations.push(new RegistrationFinalizerDestination(dataAdapter.users));
  }

  return destinations;
}
