/**
 * Analytics Engine dataset binding type
 * This is the binding object provided by Cloudflare Workers
 */
export interface AnalyticsEngineDataset {
  writeDataPoint(data: {
    blobs?: string[];
    doubles?: number[];
    indexes?: string[];
  }): void;
}

export interface AnalyticsEngineLogsAdapterConfig {
  /**
   * Cloudflare Analytics Engine dataset binding (for Workers)
   * Pass the Analytics Engine dataset object from env (e.g., env.AUTH_LOGS)
   */
  analyticsEngineBinding?: AnalyticsEngineDataset;

  /**
   * Cloudflare account ID for querying logs via SQL API
   * Required for the SQL API endpoint
   * Can be passed via environment variable: CLOUDFLARE_ACCOUNT_ID
   */
  accountId: string;

  /**
   * Cloudflare API token for querying logs via SQL API
   * Must have Analytics Engine SQL API permissions
   * Can be passed via environment variable: ANALYTICS_ENGINE_API_TOKEN
   */
  apiToken: string;

  /**
   * Analytics Engine dataset name (default: "authhero_logs")
   * This should match the dataset name configured in wrangler.toml
   */
  dataset?: string;

  /**
   * Base logs adapter to wrap (passthrough mode)
   * When provided, logs will be sent to both Analytics Engine and the base adapter
   */
  baseAdapter?: {
    create: (tenantId: string, log: any) => Promise<any>;
    get: (tenantId: string, logId: string) => Promise<any>;
    list: (tenantId: string, params?: any) => Promise<any>;
  };

  /**
   * HTTP timeout in milliseconds for SQL API queries (default: 30000)
   */
  timeout?: number;
}
