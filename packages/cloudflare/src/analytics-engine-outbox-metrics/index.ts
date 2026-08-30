import { AnalyticsEngineDataset } from "../analytics-engine-logs/types";

/**
 * One metric emission from the authhero outbox relay.
 *
 * Structurally identical to authhero's `OutboxMetric`. It is redeclared here
 * so this adapter keeps working without `authhero` installed — it is only an
 * optional peer dependency of this package.
 */
export interface OutboxMetricRecord {
  /**
   * `outbox_events_processed_total`, `outbox_events_dead_lettered_total` or
   * `outbox_retry_delay_seconds`.
   */
  name: string;
  /** Counter increment, or the observed retry delay in seconds. */
  value: number;
  tenantId: string;
  eventType: string;
  source: "request" | "cron";
  destination?: string;
  error?: string;
  retryCount?: number;
}

export interface AnalyticsEngineOutboxMetricsConfig {
  /**
   * Cloudflare Analytics Engine dataset binding (e.g. `env.OUTBOX_METRICS`).
   * When absent the sink is a no-op, so the same wiring works locally.
   */
  analyticsEngineBinding?: AnalyticsEngineDataset;
}

const truncate = (value: string, max = 1024): string => value.substring(0, max);

/**
 * Create an Analytics Engine sink for outbox relay metrics.
 *
 * Pass the returned function to `init({ outbox: { metrics } })` and to
 * `runOutboxRelay({ metrics })` so both the inline per-request relay and the
 * cron drain report to the same dataset. Rows are indexed by tenant, matching
 * `createAnalyticsEngineLogsAdapter`.
 *
 * Column layout:
 * - blob1 `name`, blob2 `tenant_id`, blob3 `event_type`, blob4 `source`,
 *   blob5 `destination`, blob6 `error`
 * - double1 `value`, double2 `retry_count`, double3 `timestamp` (ms)
 * - index1 `tenant_id`
 *
 * @example
 * ```typescript
 * // wrangler.toml:
 * // [[analytics_engine_datasets]]
 * // binding = "OUTBOX_METRICS"
 * // dataset = "authhero_outbox_metrics"
 *
 * import { createAnalyticsEngineOutboxMetricsSink } from "@authhero/cloudflare-adapter";
 *
 * const metrics = createAnalyticsEngineOutboxMetricsSink({
 *   analyticsEngineBinding: env.OUTBOX_METRICS,
 * });
 *
 * const app = init({ dataAdapter, outbox: { enabled: true, metrics } });
 * ```
 */
export function createAnalyticsEngineOutboxMetricsSink(
  config: AnalyticsEngineOutboxMetricsConfig,
): (metric: OutboxMetricRecord) => void {
  const binding = config.analyticsEngineBinding;

  return (metric: OutboxMetricRecord): void => {
    // No binding configured (local dev, tests): stay silent rather than
    // logging on every single outbox event.
    if (!binding) return;

    try {
      binding.writeDataPoint({
        blobs: [
          truncate(metric.name),
          truncate(metric.tenantId),
          truncate(metric.eventType),
          truncate(metric.source),
          truncate(metric.destination ?? ""),
          truncate(metric.error ?? ""),
        ],
        doubles: [metric.value, metric.retryCount ?? 0, Date.now()],
        indexes: [metric.tenantId.substring(0, 96)],
      });
    } catch (error) {
      // Observability must never break event delivery.
      console.error(
        "Failed to write outbox metric to Analytics Engine:",
        error,
      );
    }
  };
}
