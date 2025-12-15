export interface R2SQLLogsAdapterConfig {
  /**
   * Cloudflare Pipeline HTTP endpoint URL for ingesting logs
   * Example: "https://{stream-id}.ingest.cloudflare.com"
   * Optional if using pipelineBinding or baseAdapter
   */
  pipelineEndpoint?: string;

  /**
   * Cloudflare Pipeline binding (for Workers)
   * Use this instead of pipelineEndpoint when running in a Worker
   * Pass the Pipeline object from env (e.g., env.AUTH_LOGS_STREAM)
   * The Pipeline has a send() method for ingesting data
   */
  pipelineBinding?: { send: (data: any) => Promise<void> };

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
