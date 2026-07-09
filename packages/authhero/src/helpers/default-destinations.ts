import { CodeExecutor, DataAdapters } from "@authhero/adapter-interfaces";
import { EventDestination } from "./outbox-relay";
import { LogsDestination } from "./outbox-destinations/logs";
import { LogStreamDestination } from "./outbox-destinations/log-streams";
import {
  WebhookDestination,
  type GetServiceToken,
} from "./outbox-destinations/webhooks";
import { CodeHookDestination } from "./outbox-destinations/code-hooks";
import { RegistrationFinalizerDestination } from "./outbox-destinations/registration-finalizer";
import { ControlPlaneSyncDestination } from "./outbox-destinations/control-plane-sync";
import type { WebhookInvoker } from "../types/AuthHeroConfig";

export interface CreateDefaultDestinationsConfig {
  /**
   * Data adapter — the `logs`, `hooks`, `users`, and `logStreams` adapters are
   * used by the built-in destinations. When `codeExecutor` is set, the
   * `actions`, `hookCode`, and `actionExecutions` adapters are also required so
   * `CodeHookDestination` can resolve and run tenant code hooks.
   */
  dataAdapter: Pick<DataAdapters, "logs" | "hooks" | "users" | "logStreams"> &
    Partial<
      Pick<
        DataAdapters,
        "actions" | "hookCode" | "actionExecutions" | "multiTenancyConfig"
      >
    >;

  /**
   * Produces a Bearer access token for the given tenant, used when POSTing
   * `hook.*` events to the configured webhook URLs.
   *
   * Required if you want `hook.*` events to be drained. Omit for cron
   * drains that only need to sweep up log events.
   */
  getServiceToken?: GetServiceToken;

  /** Webhook HTTP request timeout in ms (default: 10_000). */
  webhookTimeoutMs?: number;

  /**
   * When set, drains `controlplane.sync.*` events to the control-plane
   * authhero instance at the given base URL. Mirrors the per-request
   * `ControlPlaneSyncDestination` wired in the management API, so cron-drain
   * deliveries don't lose events that missed per-request processing.
   * Requires `getServiceToken`.
   */
  controlPlaneSync?: {
    baseUrl: string;
    timeoutMs?: number;
  };

  /**
   * Custom webhook invoker — same shape as the `webhookInvoker` option on
   * `init()`. When provided, `hook.*` events are dispatched by calling this
   * function instead of issuing a raw `fetch` with a Bearer token. Use this
   * to match a consumer-configured invoker exactly, so cron-drained
   * deliveries don't diverge from inline per-request ones.
   */
  webhookInvoker?: WebhookInvoker;

  /**
   * Code executor — same instance passed to `init({ codeExecutor })`. When
   * provided (and `dataAdapter` carries `actions`, `hookCode`, and
   * `actionExecutions`), a `CodeHookDestination` is added so cron-drained
   * `hook.*` events also run tenant code hooks. Without it, code hooks that
   * failed per-request delivery would be silently skipped on retry.
   */
  codeExecutor?: CodeExecutor;
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
  const {
    dataAdapter,
    getServiceToken,
    webhookTimeoutMs,
    webhookInvoker,
    controlPlaneSync,
    codeExecutor,
  } = config;

  if (controlPlaneSync && !getServiceToken) {
    throw new Error(
      "createDefaultDestinations: controlPlaneSync requires getServiceToken",
    );
  }

  const destinations: EventDestination[] = [
    new LogsDestination(dataAdapter.logs),
  ];

  if (dataAdapter.logStreams) {
    destinations.push(new LogStreamDestination(dataAdapter.logStreams));
  }

  if (getServiceToken) {
    destinations.push(
      new WebhookDestination(dataAdapter.hooks, getServiceToken, {
        timeoutMs: webhookTimeoutMs,
        webhookInvoker,
      }),
    );
    if (controlPlaneSync) {
      destinations.push(
        new ControlPlaneSyncDestination({
          baseUrl: controlPlaneSync.baseUrl,
          timeoutMs: controlPlaneSync.timeoutMs,
          getServiceToken,
        }),
      );
    }
    // Run tenant code hooks on the cron path too, so a code hook that failed
    // per-request delivery is actually retried rather than skipped. Requires
    // the code-hook adapters alongside the executor.
    if (
      codeExecutor &&
      dataAdapter.actions &&
      dataAdapter.hookCode &&
      dataAdapter.actionExecutions
    ) {
      destinations.push(
        new CodeHookDestination(
          {
            hooks: dataAdapter.hooks,
            actions: dataAdapter.actions,
            hookCode: dataAdapter.hookCode,
            actionExecutions: dataAdapter.actionExecutions,
            multiTenancyConfig: dataAdapter.multiTenancyConfig,
          },
          codeExecutor,
        ),
      );
    }
    // Must come AFTER the delivery destinations so the registration-completed
    // flag only flips once webhook and code-hook delivery have succeeded.
    destinations.push(new RegistrationFinalizerDestination(dataAdapter.users));
  }

  return destinations;
}
