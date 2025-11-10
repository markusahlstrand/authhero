import {
  CustomDomainsAdapter,
  CacheAdapter,
  LogsDataAdapter,
} from "@authhero/adapter-interfaces";
import { createCustomDomainsAdapter } from "./customDomains";
import { createCloudflareCache } from "./cache";
import {
  createR2SQLLogsAdapter,
  type R2SQLLogsAdapterConfig,
} from "./r2-sql-logs";
import { CloudflareConfig } from "./types/CloudflareConfig";

// Re-export R2 SQL config type for convenience
export type { R2SQLLogsAdapterConfig };
export type { CloudflareConfig };

export interface CloudflareAdapters {
  customDomains: CustomDomainsAdapter;
  cache: CacheAdapter;
  logs?: LogsDataAdapter;
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
  };

  // Add R2 SQL logs adapter if configured
  if (config.r2SqlLogs) {
    adapters.logs = createR2SQLLogsAdapter(config.r2SqlLogs);
  }

  return adapters;
}
