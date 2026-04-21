import { DataAdapters } from "@authhero/adapter-interfaces";
import type { WebhookInvoker } from "../types/AuthHeroConfig";
import { drainOutbox } from "./outbox-relay";
import { cleanupOutbox } from "./outbox-cleanup";
import { createDefaultDestinations } from "./default-destinations";
import { makeOutboxServiceTokenFactory } from "./service-token";

export interface RunOutboxRelayConfig {
  /** Same `DataAdapters` passed to `init()`. Must include `outbox` to drain. */
  dataAdapter: DataAdapters;

  /**
   * Issuer URL used when minting per-tenant `auth-service` tokens (typically
   * your `env.ISSUER`). Webhook handlers that validate `iss` against this
   * URL will accept tokens from both the inline dispatcher and this cron
   * relay.
   */
  issuer: string;

  /**
   * Optional webhook invoker — same shape as the one accepted by `init()`.
   * When provided, cron-drained `hook.*` events go through this invoker,
   * matching the inline per-request dispatch path exactly.
   */
  webhookInvoker?: WebhookInvoker;

  /** Days to retain processed events before cleanup. Default 7. */
  retentionDays?: number;

  /** Forwarded to `drainOutbox`. */
  batchSize?: number;

  /** Forwarded to `drainOutbox`. */
  maxRetries?: number;

  /** Webhook HTTP timeout (ms), when the default invoker is used. */
  webhookTimeoutMs?: number;
}

/**
 * One-call outbox relay for cron / scheduled handlers.
 *
 * Internally:
 * 1. Skips gracefully when `dataAdapter.outbox` is undefined.
 * 2. Builds the same destination array as the inline dispatcher
 *    (`LogsDestination`, `WebhookDestination`, `RegistrationFinalizerDestination`).
 * 3. Mints per-tenant service tokens via the same in-process path
 *    (`createServiceTokenCore`) that the request-time webhookInvoker uses,
 *    driven by the supplied dataAdapter.
 * 4. Runs `drainOutbox`, then `cleanupOutbox`.
 *
 * This is intended to be the entire body of a consumer's scheduled handler
 * for outbox maintenance — consumers should not need to call `drainOutbox` /
 * `cleanupOutbox` / `createDefaultDestinations` directly.
 *
 * @example
 * ```ts
 * export default {
 *   async scheduled(_event, env) {
 *     await runOutboxRelay({
 *       dataAdapter,
 *       issuer: env.ISSUER,
 *       webhookInvoker,   // same function passed to init()
 *       retentionDays: 7,
 *     });
 *   },
 * };
 * ```
 */
export async function runOutboxRelay(
  config: RunOutboxRelayConfig,
): Promise<void> {
  const {
    dataAdapter,
    issuer,
    webhookInvoker,
    retentionDays = 7,
    batchSize,
    maxRetries,
    webhookTimeoutMs,
  } = config;

  if (!dataAdapter.outbox) {
    return;
  }

  const getServiceToken = makeOutboxServiceTokenFactory({
    tenants: dataAdapter.tenants,
    keys: dataAdapter.keys,
    issuer,
  });

  const destinations = createDefaultDestinations({
    dataAdapter,
    getServiceToken,
    webhookTimeoutMs,
    webhookInvoker,
  });

  await drainOutbox(dataAdapter.outbox, destinations, {
    batchSize,
    maxRetries,
    retentionDays,
  });

  await cleanupOutbox(dataAdapter.outbox, { retentionDays });
}
