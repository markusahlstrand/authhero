import { LogsDataAdapter } from "@authhero/adapter-interfaces";
import { R2SQLLogsAdapterConfig } from "./types";
import { createLog, getLogs } from "./logs";
import { listLogs } from "./list";

export type { R2SQLLogsAdapterConfig };

/**
 * Create an R2 SQL logs adapter
 *
 * @param config Configuration for the R2 SQL adapter
 * @returns LogsDataAdapter instance
 *
 * @example HTTP endpoint mode
 * ```typescript
 * import { createR2SQLLogsAdapter } from "@authhero/cloudflare-adapter";
 *
 * const adapter = createR2SQLLogsAdapter({
 *   pipelineEndpoint: "https://your-stream-id.ingest.cloudflare.com",
 *   authToken: process.env.R2_SQL_AUTH_TOKEN,
 *   warehouseName: process.env.R2_WAREHOUSE_NAME,
 * });
 * ```
 *
 * @example Service binding mode (Workers)
 * ```typescript
 * // In wrangler.toml:
 * // [[pipelines]]
 * // binding = "AUTH_LOGS_STREAM"
 * // pipeline = "your-pipeline-id"
 *
 * const adapter = createR2SQLLogsAdapter({
 *   pipelineBinding: env.AUTH_LOGS_STREAM,
 *   authToken: env.R2_SQL_AUTH_TOKEN,
 *   warehouseName: env.R2_WAREHOUSE_NAME,
 * });
 * ```
 *
 * @example Passthrough mode (wrap another adapter)
 * ```typescript
 * const baseAdapter = createSomeOtherLogsAdapter();
 * const adapter = createR2SQLLogsAdapter({
 *   baseAdapter,
 *   pipelineEndpoint: "https://your-stream-id.ingest.cloudflare.com",
 *   authToken: process.env.R2_SQL_AUTH_TOKEN,
 *   warehouseName: process.env.R2_WAREHOUSE_NAME,
 * });
 * ```
 */
export function createR2SQLLogsAdapter(
  config: R2SQLLogsAdapterConfig,
): LogsDataAdapter {
  // Validate required config based on mode
  const hasBaseAdapter = !!config.baseAdapter;
  const hasPipelineEndpoint = !!config.pipelineEndpoint;
  const hasPipelineBinding = !!config.pipelineBinding;

  // Need at least one of: baseAdapter, pipelineEndpoint, or pipelineBinding
  if (!hasBaseAdapter && !hasPipelineEndpoint && !hasPipelineBinding) {
    throw new Error(
      'R2 SQL logs adapter requires one of: "baseAdapter", "pipelineEndpoint", or "pipelineBinding"',
    );
  }

  // If not using baseAdapter, need R2 SQL query credentials
  if (!hasBaseAdapter) {
    if (!config.authToken) {
      throw new Error('R2 SQL logs adapter requires "authToken" configuration');
    }
    if (!config.warehouseName) {
      throw new Error(
        'R2 SQL logs adapter requires "warehouseName" configuration',
      );
    }
  }

  return {
    create: createLog(config),
    list: listLogs(config),
    get: getLogs(config),
  };
}

export default createR2SQLLogsAdapter;
