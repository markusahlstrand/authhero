import {
  CustomDomainsAdapter,
  CacheAdapter,
} from "@authhero/adapter-interfaces";
import { createCustomDomainsAdapter } from "./customDomains";
import { createCloudflareCache } from "./cache";
import { CloudflareConfig } from "./types/CloudflareConfig";

export default function createAdapters(config: CloudflareConfig): {
  customDomains: CustomDomainsAdapter;
  cache?: CacheAdapter;
} {
  const adapters: {
    customDomains: CustomDomainsAdapter;
    cache?: CacheAdapter;
  } = {
    customDomains: createCustomDomainsAdapter(config),
  };

  // Create cache adapter if any cache config is provided
  if (config.cacheName || config.defaultTtlSeconds || config.keyPrefix) {
    adapters.cache = createCloudflareCache({
      cacheName: config.cacheName,
      defaultTtlSeconds: config.defaultTtlSeconds,
      keyPrefix: config.keyPrefix,
    });
  }

  return adapters;
}
