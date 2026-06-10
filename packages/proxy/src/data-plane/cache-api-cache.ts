import type { ResolvedHost } from "../adapter";
import type { HostResolverCache } from "./cache";
import { withRaceTimeout } from "./timeout";

export interface CacheApiHostCacheOptions {
  // Underlying resolver (e.g. an HTTP adapter or DB adapter). The Cache-API
  // layer wraps it and serves cached responses when available.
  upstream: HostResolverCache;
  // Seconds to keep entries in the Cloudflare Cache API. Hosts not yet known
  // are cached for a (typically shorter) negative window.
  cacheTtlSeconds?: number;
  negativeCacheTtlSeconds?: number;
  // Cache namespace used to scope keys. Defaults to "authhero-proxy".
  namespace?: string;
  // The Cache instance to use. Defaults to `caches.default`. Workers expose
  // this globally; on other runtimes a polyfill or custom implementation can
  // be supplied.
  cache?: Cache;
  // Optional `ctx.waitUntil` so async cache writes don't block the response.
  waitUntil?: (promise: Promise<unknown>) => void;
  // Per-operation timeouts on the Cache API. Defaults to 1s read / 1s write
  // so a stuck cache call falls through to the upstream resolver.
  cacheReadTimeoutMs?: number;
  cacheWriteTimeoutMs?: number;
}

interface CachedPayload {
  value: ResolvedHost | null;
}

const DEFAULT_CACHE_READ_TIMEOUT_MS = 1_000;
const DEFAULT_CACHE_WRITE_TIMEOUT_MS = 1_000;

function syntheticKey(namespace: string, host: string): Request {
  return new Request(
    `https://proxy-cache.internal/${encodeURIComponent(namespace)}/hosts/${encodeURIComponent(host.toLowerCase())}`,
    { method: "GET" },
  );
}

function getDefaultCache(): Cache | undefined {
  const c = (globalThis as { caches?: { default?: Cache } }).caches;
  return c?.default;
}

/**
 * Wraps an upstream `HostResolverCache` with a Cloudflare Cache-API layer.
 * On cache miss, the upstream is queried and the result written back into
 * the Cache API for subsequent reads in the same colo.
 *
 * Invalidation is the caller's responsibility — typically the control plane
 * issues `cache.delete(syntheticKey(...))` on every proxy_route mutation,
 * and each colo's cache expires on its own TTL otherwise.
 *
 * @deprecated Prefer `createCacheAdapterHostCache` with `createCloudflareCache`
 * from `@authhero/cloudflare-adapter`. The adapter-based wrapper supports
 * stale-while-revalidate, stale-if-error, and works with any `CacheAdapter`
 * (Cloudflare, Redis, in-memory, …).
 */
export function createCacheApiHostCache(
  options: CacheApiHostCacheOptions,
): HostResolverCache {
  const resolved = options.cache ?? getDefaultCache();
  if (!resolved) {
    return options.upstream;
  }
  const cache: Cache = resolved;

  const namespace = options.namespace ?? "authhero-proxy";
  const positiveTtl = options.cacheTtlSeconds ?? 60;
  const negativeTtl = options.negativeCacheTtlSeconds ?? 10;
  const waitUntil = options.waitUntil;
  const cacheReadTimeoutMs =
    options.cacheReadTimeoutMs ?? DEFAULT_CACHE_READ_TIMEOUT_MS;
  const cacheWriteTimeoutMs =
    options.cacheWriteTimeoutMs ?? DEFAULT_CACHE_WRITE_TIMEOUT_MS;

  async function safeCacheMatch(key: Request): Promise<Response | undefined> {
    try {
      return await withRaceTimeout(
        Promise.resolve(cache.match(key)),
        cacheReadTimeoutMs,
        "cache.match",
      );
    } catch {
      // Treat slow or failing cache reads as a miss — the upstream is the
      // source of truth and always tried as a fallback.
      return undefined;
    }
  }

  return {
    async resolveHost(host: string): Promise<ResolvedHost | null> {
      const key = syntheticKey(namespace, host);
      const hit = await safeCacheMatch(key);
      if (hit) {
        try {
          const payload = (await hit.json()) as CachedPayload;
          return payload.value;
        } catch {
          // Bad cached payload — fall through to upstream and overwrite.
        }
      }

      const value = await options.upstream.resolveHost(host);
      const ttl = value === null ? negativeTtl : positiveTtl;
      const cached = new Response(
        JSON.stringify({ value } satisfies CachedPayload),
        {
          headers: {
            "content-type": "application/json",
            "cache-control": `public, max-age=${ttl}`,
          },
        },
      );
      const put = withRaceTimeout(
        Promise.resolve(cache.put(key, cached)),
        cacheWriteTimeoutMs,
        "cache.put",
      ).catch(() => undefined);
      if (waitUntil) waitUntil(put);
      // Without a `waitUntil` hook the runtime can recycle the isolate before
      // the put finishes, so we await the (bounded, error-swallowing) write.
      else await put;

      return value;
    },
  };
}

export function buildCacheApiKey(namespace: string, host: string): Request {
  return syntheticKey(namespace, host);
}
