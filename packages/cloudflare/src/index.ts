import {
  CustomDomainsAdapter,
  CacheAdapter,
} from "@authhero/adapter-interfaces";
import { createCustomDomainsAdapter } from "./customDomains";
import { createCloudflareCache } from "./cache";
import { CloudflareConfig } from "./types/CloudflareConfig";

export default function createAdapters(config: CloudflareConfig): {
  customDomains: CustomDomainsAdapter;
  cache: CacheAdapter;
} {
  const adapters: {
    customDomains: CustomDomainsAdapter;
    cache: CacheAdapter;
  } = {
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

  return adapters;
}
