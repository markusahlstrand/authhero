import { LogsDataAdapter } from "@authhero/adapter-interfaces";
import { AnalyticsEngineLogsAdapterConfig } from "./types";
import { createLog, getLogs } from "./logs";
import { listLogs } from "./list";

export type {
  AnalyticsEngineLogsAdapterConfig,
  AnalyticsEngineDataset,
} from "./types";

export { createAnalyticsEngineStatsAdapter } from "./stats";

/**
 * Create an Analytics Engine logs adapter
 *
 * This adapter uses Cloudflare's Workers Analytics Engine for storing and querying logs.
 * It provides a simpler alternative to R2 SQL logs with lower latency for writes.
 *
 * For passthrough mode (syncing writes to multiple destinations), use the core
 * `createPassthroughAdapter` utility from `@authhero/adapter-interfaces` instead.
 *
 * @param config Configuration for the Analytics Engine adapter
 * @returns LogsDataAdapter instance
 *
 * @example Basic usage with Analytics Engine binding
 * ```typescript
 * // In wrangler.toml:
 * // [[analytics_engine_datasets]]
 * // binding = "AUTH_LOGS"
 * // dataset = "authhero_logs"
 *
 * import { createAnalyticsEngineLogsAdapter } from "@authhero/cloudflare-adapter";
 *
 * const adapter = createAnalyticsEngineLogsAdapter({
 *   analyticsEngineBinding: env.AUTH_LOGS,
 *   accountId: env.CLOUDFLARE_ACCOUNT_ID,
 *   apiToken: env.ANALYTICS_ENGINE_API_TOKEN,
 *   dataset: "authhero_logs",
 * });
 * ```
 *
 * @example Passthrough mode (use core utility)
 * ```typescript
 * import { createPassthroughAdapter } from "@authhero/adapter-interfaces";
 * import { createAnalyticsEngineLogsAdapter } from "@authhero/cloudflare-adapter";
 *
 * const primaryAdapter = createDatabaseLogsAdapter();
 * const analyticsAdapter = createAnalyticsEngineLogsAdapter({
 *   analyticsEngineBinding: env.AUTH_LOGS,
 *   accountId: env.CLOUDFLARE_ACCOUNT_ID,
 *   apiToken: env.ANALYTICS_ENGINE_API_TOKEN,
 * });
 *
 * const logsAdapter = createPassthroughAdapter({
 *   primary: primaryAdapter,
 *   secondaries: [{ adapter: { create: analyticsAdapter.create } }],
 * });
 * ```
 */
export function createAnalyticsEngineLogsAdapter(
  config: AnalyticsEngineLogsAdapterConfig,
): LogsDataAdapter {
  // Validate required config
  if (!config.analyticsEngineBinding) {
    console.warn(
      "Analytics Engine: No binding configured. Logs will not be written to Analytics Engine.",
    );
  }

  if (!config.accountId || !config.apiToken) {
    console.warn(
      "Analytics Engine: accountId and apiToken are required for querying logs via SQL API.",
    );
  }

  return {
    create: createLog(config),
    list: listLogs(config),
    get: getLogs(config),
  };
}
