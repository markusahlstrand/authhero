import type { AnalyticsEngineDataset } from "../analytics-engine-logs/types";

export interface AnalyticsEngineActionExecutionsAdapterConfig {
  /**
   * Cloudflare Analytics Engine dataset binding (for Workers).
   * Pass the Analytics Engine dataset object from env (e.g.
   * env.AUTH_ACTION_EXECUTIONS).
   */
  analyticsEngineBinding?: AnalyticsEngineDataset;

  /**
   * Cloudflare account ID for querying via the SQL API.
   * Can be passed via environment variable: CLOUDFLARE_ACCOUNT_ID.
   */
  accountId: string;

  /**
   * Cloudflare API token for querying via the SQL API.
   * Must have Analytics Engine SQL API permissions.
   * Can be passed via environment variable: ANALYTICS_ENGINE_API_TOKEN.
   */
  apiToken: string;

  /**
   * Analytics Engine dataset name (default: "authhero_action_executions").
   * Should match the dataset name configured in wrangler.toml.
   */
  dataset?: string;

  /**
   * HTTP timeout in milliseconds for SQL API queries (default: 30000).
   */
  timeout?: number;
}
