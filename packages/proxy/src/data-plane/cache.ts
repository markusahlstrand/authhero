import { ProxyDataAdapter, ResolvedHost } from "../adapter";

interface CacheEntry {
  value: ResolvedHost | null;
  expires_at: number;
}

export interface HostResolverCache {
  resolveHost(host: string): Promise<ResolvedHost | null>;
}

export function createInMemoryHostCache(
  data: ProxyDataAdapter,
  ttlMs: number,
): HostResolverCache {
  const cache = new Map<string, CacheEntry>();

  return {
    async resolveHost(host: string) {
      const now = Date.now();
      const cached = cache.get(host);
      if (cached && cached.expires_at > now) return cached.value;

      const value = await data.resolveHost(host);
      cache.set(host, { value, expires_at: now + ttlMs });
      return value;
    },
  };
}
