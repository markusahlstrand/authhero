import type { CacheAdapter } from "@authhero/adapter-interfaces";
import type { ResolvedHost } from "../adapter";
import type { HostResolverCache } from "./cache";

export interface CacheAdapterHostCacheOptions {
  // Underlying resolver (e.g. an HTTP adapter or DB adapter). The cache layer
  // wraps it and serves cached responses when available.
  upstream: HostResolverCache;
  // Generic key/value cache implementation (e.g. CloudflareCache from
  // @authhero/cloudflare-adapter, an in-memory adapter, or a Redis adapter).
  cache: CacheAdapter;
  // Time the cached entry is served without contacting the upstream.
  freshTtlMs: number;
  // Extra window past freshTtlMs during which the cached value is served
  // immediately while a background refresh runs (stale-while-revalidate).
  staleTtlMs?: number;
  // Separate (usually shorter) cache window for null results so a host added
  // after a miss becomes reachable quickly. Defaults to freshTtlMs.
  negativeTtlMs?: number;
  // Key prefix used to scope entries within the adapter. Defaults to
  // "authhero-proxy-host".
  keyPrefix?: string;
  // Optional `ctx.waitUntil` so async cache writes don't block the response.
  waitUntil?: (promise: Promise<unknown>) => void;
}

interface CachedPayload {
  value: ResolvedHost | null;
  freshUntilMs: number;
  staleUntilMs: number;
}

/**
 * Wraps an upstream `HostResolverCache` with a generic `CacheAdapter` layer.
 * Adds stale-while-revalidate semantics on top of any cache implementation
 * — Cloudflare Cache API (via `CloudflareCache` from `@authhero/cloudflare-adapter`),
 * Redis, in-memory, or anything else satisfying the `CacheAdapter` interface.
 *
 * Typical use on Cloudflare Workers:
 *
 * ```ts
 * import { createCloudflareCache } from "@authhero/cloudflare-adapter";
 * import { createCacheAdapterHostCache, createInMemoryHostCache } from "@authhero/proxy";
 *
 * const cache = createCloudflareCache({ cacheName: "authhero-proxy-hosts" });
 * const resolver = createCacheAdapterHostCache({
 *   upstream: createInMemoryHostCache(data, { freshTtlMs: 60_000 }),
 *   cache,
 *   freshTtlMs: 60 * 60_000,           // 1 hour fresh
 *   staleTtlMs: 23 * 60 * 60_000,      // SWR for 23 more hours (24h total)
 *   waitUntil: (p) => ctx.waitUntil(p),
 * });
 * ```
 *
 * Invalidation is the caller's responsibility — when a host's routes change,
 * call `cache.delete(buildCacheAdapterKey(keyPrefix, host))` from the control
 * plane. Otherwise entries expire on their own TTL.
 */
export function createCacheAdapterHostCache(
  options: CacheAdapterHostCacheOptions,
): HostResolverCache {
  const {
    upstream,
    cache,
    freshTtlMs,
    staleTtlMs = 0,
    negativeTtlMs = freshTtlMs,
    keyPrefix = "authhero-proxy-host",
    waitUntil,
  } = options;

  const inflight = new Map<string, Promise<ResolvedHost | null>>();

  function buildKey(host: string): string {
    return `${keyPrefix}:${host.toLowerCase()}`;
  }

  async function refresh(host: string): Promise<ResolvedHost | null> {
    const existing = inflight.get(host);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const value = await upstream.resolveHost(host);
        const now = Date.now();
        const freshTtl = value === null ? negativeTtlMs : freshTtlMs;
        const staleTtl = value === null ? 0 : staleTtlMs;
        const payload: CachedPayload = {
          value,
          freshUntilMs: now + freshTtl,
          staleUntilMs: now + freshTtl + staleTtl,
        };
        const ttlSeconds = Math.max(1, Math.ceil((freshTtl + staleTtl) / 1000));
        await cache.set(buildKey(host), payload, ttlSeconds);
        return value;
      } finally {
        inflight.delete(host);
      }
    })();

    inflight.set(host, promise);
    return promise;
  }

  return {
    async resolveHost(host: string): Promise<ResolvedHost | null> {
      const key = buildKey(host);
      const cached = await cache.get<CachedPayload>(key);
      const now = Date.now();

      if (cached && typeof cached.freshUntilMs === "number") {
        if (cached.freshUntilMs > now) {
          return cached.value;
        }
        if (cached.staleUntilMs > now) {
          if (!inflight.has(host)) {
            const p = refresh(host).catch(() => undefined);
            if (waitUntil) waitUntil(p);
          }
          return cached.value;
        }
      }

      return refresh(host);
    },
  };
}

export function buildCacheAdapterKey(keyPrefix: string, host: string): string {
  return `${keyPrefix}:${host.toLowerCase()}`;
}
