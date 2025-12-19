import {
  CustomDomainsAdapter,
  CacheAdapter,
  LogsDataAdapter,
  GeoAdapter,
} from "@authhero/adapter-interfaces";
import { createCustomDomainsAdapter } from "./customDomains";
import { createCloudflareCache } from "./cache";
import {
  createR2SQLLogsAdapter,
  type R2SQLLogsAdapterConfig,
} from "./r2-sql-logs";
import {
  createAnalyticsEngineLogsAdapter,
  type AnalyticsEngineLogsAdapterConfig,
  type AnalyticsEngineDataset,
} from "./analytics-engine-logs";
import { createCloudflareGeoAdapter } from "./geo";
import { CloudflareConfig } from "./types/CloudflareConfig";

// Re-export R2 SQL config type for convenience
export type { R2SQLLogsAdapterConfig };
// Re-export Analytics Engine config types for convenience
export type { AnalyticsEngineLogsAdapterConfig, AnalyticsEngineDataset };
export type { CloudflareConfig };

// Re-export adapters for direct usage
export { createAnalyticsEngineLogsAdapter } from "./analytics-engine-logs";
export { createAnalyticsEngineStatsAdapter } from "./analytics-engine-logs";
export { createR2SQLLogsAdapter } from "./r2-sql-logs";
export { createR2SQLStatsAdapter } from "./r2-sql-logs";

export interface CloudflareAdapters {
  customDomains: CustomDomainsAdapter;
  cache: CacheAdapter;
  logs?: LogsDataAdapter;
  geo?: GeoAdapter;
}

export default function createAdapters(
  config: CloudflareConfig,
): CloudflareAdapters {
  const adapters: CloudflareAdapters = {
    customDomains: createCustomDomainsAdapter(config),
    // Always create a cache adapter (let createCloudflareCache apply defaults)
    cache: createCloudflareCache({
      ...(config.cacheName && { cacheName: config.cacheName }),
      ...(config.defaultTtlSeconds !== undefined && {
        defaultTtlSeconds: config.defaultTtlSeconds,
      }),
      ...(config.keyPrefix && { keyPrefix: config.keyPrefix }),
    }),
    // Always create the geo adapter - it extracts location from Cloudflare headers
    // passed at request time via getGeoInfo(headers)
    geo: createCloudflareGeoAdapter(),
  };

  // Add logs adapter if configured
  // R2 SQL logs takes precedence if both are configured
  if (config.r2SqlLogs) {
    adapters.logs = createR2SQLLogsAdapter(config.r2SqlLogs);
  } else if (config.analyticsEngineLogs) {
    adapters.logs = createAnalyticsEngineLogsAdapter(
      config.analyticsEngineLogs,
    );
  }

  return adapters;
}
