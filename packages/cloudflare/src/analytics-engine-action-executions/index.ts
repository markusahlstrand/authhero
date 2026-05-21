import { ActionExecutionsAdapter } from "@authhero/adapter-interfaces";
import { AnalyticsEngineActionExecutionsAdapterConfig } from "./types";
import { createActionExecution, getActionExecution } from "./actionExecutions";

export type { AnalyticsEngineActionExecutionsAdapterConfig } from "./types";

/**
 * Create an Analytics Engine action_executions adapter.
 *
 * Persists Auth0-shaped action execution records (one row per execution) into
 * a Cloudflare Analytics Engine dataset and reads them back via the AE SQL
 * API. Pair with `createAnalyticsEngineLogsAdapter` so logs and the
 * executions they reference live in the same place.
 *
 * @example
 * ```typescript
 * // wrangler.toml:
 * // [[analytics_engine_datasets]]
 * // binding = "AUTH_ACTION_EXECUTIONS"
 * // dataset = "authhero_action_executions"
 *
 * import { createAnalyticsEngineActionExecutionsAdapter } from "@authhero/cloudflare-adapter";
 *
 * const adapter = createAnalyticsEngineActionExecutionsAdapter({
 *   analyticsEngineBinding: env.AUTH_ACTION_EXECUTIONS,
 *   accountId: env.CLOUDFLARE_ACCOUNT_ID,
 *   apiToken: env.ANALYTICS_ENGINE_API_TOKEN,
 *   dataset: "authhero_action_executions",
 * });
 * ```
 */
export function createAnalyticsEngineActionExecutionsAdapter(
  config: AnalyticsEngineActionExecutionsAdapterConfig,
): ActionExecutionsAdapter {
  if (!config.analyticsEngineBinding) {
    console.warn(
      "Analytics Engine: No action_executions binding configured. Executions will not be written.",
    );
  }
  if (!config.accountId || !config.apiToken) {
    console.warn(
      "Analytics Engine: accountId and apiToken are required to read action_executions via the SQL API.",
    );
  }

  return {
    create: createActionExecution(config),
    get: getActionExecution(config),
  };
}
