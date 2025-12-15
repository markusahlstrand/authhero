import { LogsDataAdapter } from "@authhero/adapter-interfaces";
import { AnalyticsEngineLogsAdapterConfig } from "./types";
import { createLog, getLogs } from "./logs";
import { listLogs } from "./list";

export type { AnalyticsEngineLogsAdapterConfig, AnalyticsEngineDataset } from "./types";

/**
 * Create an Analytics Engine logs adapter
 *
 * This adapter uses Cloudflare's Workers Analytics Engine for storing and querying logs.
 * It provides a simpler alternative to R2 SQL logs with lower latency for writes.
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
 * @example Passthrough mode (wrap another adapter)
 * ```typescript
 * const baseAdapter = createSomeOtherLogsAdapter();
 * const adapter = createAnalyticsEngineLogsAdapter({
 *   baseAdapter,
 *   analyticsEngineBinding: env.AUTH_LOGS,
 *   accountId: env.CLOUDFLARE_ACCOUNT_ID,
 *   apiToken: env.ANALYTICS_ENGINE_API_TOKEN,
 * });
 * ```
 */
export function createAnalyticsEngineLogsAdapter(
  config: AnalyticsEngineLogsAdapterConfig,
): LogsDataAdapter {
  // Validate required config
  if (!config.analyticsEngineBinding && !config.baseAdapter) {
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
