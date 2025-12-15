import { CustomDomainsAdapter } from "@authhero/adapter-interfaces";
import type { R2SQLLogsAdapterConfig } from "../r2-sql-logs";
import type { AnalyticsEngineLogsAdapterConfig } from "../analytics-engine-logs";

export interface CloudflareConfig {
  zoneId: string;
  authKey: string;
  authEmail: string;
  enterprise?: boolean;
  customDomainAdapter: CustomDomainsAdapter;
  /**
   * Cache name to use (optional, defaults to "default")
   */
  cacheName?: string;
  /**
   * Default TTL in seconds for cache entries (optional)
   */
  defaultTtlSeconds?: number;
  /**
   * Key prefix to namespace cache entries (optional)
   */
  keyPrefix?: string;
  /**
   * R2 SQL logs adapter configuration (optional)
   * Use this for high-volume log storage with R2 Pipelines and R2 SQL
   */
  r2SqlLogs?: R2SQLLogsAdapterConfig;
  /**
   * Analytics Engine logs adapter configuration (optional)
   * Use this for low-latency log writes with Cloudflare Analytics Engine
   */
  analyticsEngineLogs?: AnalyticsEngineLogsAdapterConfig;
}
