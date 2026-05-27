import { ProxyDataAdapter, ResolvedHost } from "../adapter";

interface CacheEntry {
  value: ResolvedHost | null;
  expires_at: number;
}

export interface HostResolverCache {
  resolveHost(host: string): Promise<ResolvedHost | null>;
}

const DEFAULT_MAX_ENTRIES = 10_000;

export function createInMemoryHostCache(
  data: ProxyDataAdapter,
  ttlMs: number,
  maxEntries: number = DEFAULT_MAX_ENTRIES,
): HostResolverCache {
  const cache = new Map<string, CacheEntry>();

  return {
    async resolveHost(host: string) {
      const now = Date.now();
      const cached = cache.get(host);
      if (cached && cached.expires_at > now) {
        // Refresh LRU position so hot keys survive eviction.
        cache.delete(host);
        cache.set(host, cached);
        return cached.value;
      }
      if (cached) cache.delete(host);

      const value = await data.resolveHost(host);

      for (const [key, entry] of cache) {
        if (entry.expires_at <= now) cache.delete(key);
        else break;
      }
      while (cache.size >= maxEntries) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
      }

      cache.set(host, { value, expires_at: now + ttlMs });
      return value;
    },
  };
}
