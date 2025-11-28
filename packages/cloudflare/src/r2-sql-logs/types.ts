export interface R2SQLLogsAdapterConfig {
  /**
   * Cloudflare Pipeline HTTP endpoint URL for ingesting logs
   * Example: "https://{stream-id}.ingest.cloudflare.com"
   * Optional if using pipelineBinding or baseAdapter
   */
  pipelineEndpoint?: string;

  /**
   * Cloudflare service binding for Pipeline (for Workers)
   * Use this instead of pipelineEndpoint when running in a Worker
   * Must have a fetch() method or can be the Pipeline directly
   * Can be passed as env.AUTHHERO_LOGS_STREAM from wrangler.toml
   */
  pipelineBinding?: { fetch: typeof fetch };

  /**
   * Base logs adapter to wrap (passthrough mode)
   * When provided, logs will be sent to both the Pipeline and the base adapter
   */
  baseAdapter?: {
    create: (tenantId: string, log: any) => Promise<any>;
    get: (tenantId: string, logId: string) => Promise<any>;
    list: (tenantId: string, params?: any) => Promise<any>;
  };

  /**
   * Cloudflare account ID for R2 SQL API
   * Required for the official API endpoint
   * Can be passed via environment variable: CLOUDFLARE_ACCOUNT_ID
   */
  accountId: string;

  /**
   * Cloudflare R2 SQL API token for querying logs
   * Can be passed via environment variable: R2_SQL_AUTH_TOKEN
   */
  authToken: string;

  /**
   * R2 warehouse name (e.g., "default")
   * Can be passed via environment variable: R2_WAREHOUSE_NAME
   */
  warehouseName: string;

  /**
   * Catalog database/namespace for logs (default: "default")
   */
  namespace?: string;

  /**
   * Catalog table name for logs (default: "logs")
   */
  tableName?: string;

  /**
   * HTTP timeout in milliseconds (default: 30000)
   */
  timeout?: number;
}
