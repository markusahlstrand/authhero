import { CustomDomainsAdapter } from "@authhero/adapter-interfaces";
import type { R2SQLLogsAdapterConfig } from "../r2-sql-logs";
import type { AnalyticsEngineLogsAdapterConfig } from "../analytics-engine-logs";
import type { AnalyticsEngineActionExecutionsAdapterConfig } from "../analytics-engine-action-executions";
import type { CloudflareRateLimitBindings } from "../rate-limit";

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
  /**
   * Analytics Engine action_executions adapter configuration (optional).
   * Stores Auth0-shaped action execution records in a dedicated AE dataset
   * so logs and the executions they reference can both live in AE.
   */
  analyticsEngineActionExecutions?: AnalyticsEngineActionExecutionsAdapterConfig;
  /**
   * Cloudflare Workers Rate Limiter bindings, keyed by logical scope.
   * Each binding's `limit` and `period` are baked in at deploy time; this
   * adapter can't override them per tenant. Bindings are optional — any
   * unconfigured scope is treated as permissive.
   */
  rateLimitBindings?: CloudflareRateLimitBindings;
}
