/**
 * Metric names emitted by the outbox relay.
 *
 * - `outbox_events_processed_total` — counter, one per event that every
 *   accepting destination delivered successfully.
 * - `outbox_events_dead_lettered_total` — counter, one per event moved to the
 *   dead-letter state (retries exhausted, or no destination accepted it).
 * - `outbox_retry_delay_seconds` — observation, emitted once per delivery
 *   failure with the backoff delay before the next attempt. Its count doubles
 *   as a retry counter.
 */
export type OutboxMetricName =
  | "outbox_events_processed_total"
  | "outbox_events_dead_lettered_total"
  | "outbox_retry_delay_seconds";

/** A single metric emission from the outbox relay. */
export interface OutboxMetric {
  name: OutboxMetricName;
  /** Counter increment, or the observed value for `outbox_retry_delay_seconds`. */
  value: number;
  /** Tenant the event belongs to. */
  tenantId: string;
  /** Audit event type, e.g. `hook.post-user-registration`. */
  eventType: string;
  /** Which relay path emitted this: inline per-request, or the cron drain. */
  source: "request" | "cron";
  /** Destination that failed, when the metric was caused by a delivery failure. */
  destination?: string;
  /** Failure reason, for retry and dead-letter metrics. */
  error?: string;
  /** Retry count of the event at the time of emission. */
  retryCount?: number;
}

/**
 * Optional sink for outbox relay metrics.
 *
 * Kept deliberately sink-agnostic: `packages/authhero` never knows where the
 * numbers end up. Consumers pass a callback that forwards to whatever they
 * use (Cloudflare Analytics Engine, StatsD, OpenTelemetry, a log line).
 * `@authhero/cloudflare-adapter` ships an Analytics Engine implementation via
 * `createAnalyticsEngineOutboxMetricsSink`.
 *
 * Implementations must not throw and should not return a promise the relay
 * has to await — the relay calls this synchronously and swallows errors, so a
 * broken sink can never fail event delivery.
 */
export type OutboxMetricsSink = (metric: OutboxMetric) => void;
