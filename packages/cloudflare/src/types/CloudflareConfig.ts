import { CustomDomainsAdapter } from "@authhero/adapter-interfaces";

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
}
