import type { CacheAdapter } from "@authhero/adapter-interfaces";
import type { ResolvedHost } from "../adapter";
import type { HostResolverCache } from "./cache";
import { withRaceTimeout } from "./timeout";

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
  // Extra window past staleTtlMs during which a previously-cached value is
  // served *only* if the upstream refresh throws. Lets the proxy degrade
  // gracefully when the control plane is unreachable instead of failing
  // closed. Defaults to 0 (disabled).
  staleIfErrorTtlMs?: number;
  // Separate (usually shorter) cache window for null results so a host added
  // after a miss becomes reachable quickly. Defaults to freshTtlMs.
  negativeTtlMs?: number;
  // Key prefix used to scope entries within the adapter. Defaults to
  // "authhero-proxy-host".
  keyPrefix?: string;
  // Optional `ctx.waitUntil` so async cache writes don't block the response.
  waitUntil?: (promise: Promise<unknown>) => void;
  // Per-operation timeouts on the underlying `CacheAdapter`. Defaults are
  // tight (1s read / 1s write) so a slow KV/D1/Redis call falls through to
  // the upstream instead of hanging the request.
  cacheReadTimeoutMs?: number;
  cacheWriteTimeoutMs?: number;
}

interface CachedPayload {
  value: ResolvedHost | null;
  freshUntilMs: number;
  staleUntilMs: number;
  // Optional in older payloads — checked defensively before use.
  staleIfErrorUntilMs?: number;
}

const DEFAULT_CACHE_READ_TIMEOUT_MS = 1_000;
const DEFAULT_CACHE_WRITE_TIMEOUT_MS = 1_000;

/**
 * Wraps an upstream `HostResolverCache` with a generic `CacheAdapter` layer.
 * Adds stale-while-revalidate and stale-if-error semantics on top of any
 * cache implementation — Cloudflare Cache API (via `CloudflareCache` from
 * `@authhero/cloudflare-adapter`), Redis, in-memory, or anything else
 * satisfying the `CacheAdapter` interface.
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
 *   staleIfErrorTtlMs: 24 * 60 * 60_000, // serve last-known-good for one more day on upstream errors
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
    staleIfErrorTtlMs = 0,
    negativeTtlMs = freshTtlMs,
    keyPrefix = "authhero-proxy-host",
    waitUntil,
    cacheReadTimeoutMs = DEFAULT_CACHE_READ_TIMEOUT_MS,
    cacheWriteTimeoutMs = DEFAULT_CACHE_WRITE_TIMEOUT_MS,
  } = options;

  const inflight = new Map<string, Promise<ResolvedHost | null>>();

  function buildKey(host: string): string {
    return `${keyPrefix}:${host.toLowerCase()}`;
  }

  async function safeCacheGet(key: string): Promise<CachedPayload | null> {
    try {
      const got = await withRaceTimeout(
        cache.get<CachedPayload>(key),
        cacheReadTimeoutMs,
        "cache.get",
      );
      return got ?? null;
    } catch {
      // Treat slow or failing cache lookups as a miss — the upstream is
      // the source of truth and is always tried as a fallback.
      return null;
    }
  }

  function safeCacheSet(
    key: string,
    payload: CachedPayload,
    ttlSeconds: number,
  ): Promise<void> {
    // Wrap in `Promise.resolve().then(...)` so a synchronous throw from
    // `cache.set` is funneled into the `.catch` below instead of escaping.
    const op = withRaceTimeout(
      Promise.resolve().then(() => cache.set(key, payload, ttlSeconds)),
      cacheWriteTimeoutMs,
      "cache.set",
    ).catch(() => undefined);
    if (waitUntil) {
      waitUntil(op);
      return Promise.resolve();
    }
    return op as Promise<void>;
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
        // Don't extend the stale-if-error window for negative results — a
        // stale "not found" would shadow a newly-registered host.
        const staleIfErrorTtl = value === null ? 0 : staleIfErrorTtlMs;
        const payload: CachedPayload = {
          value,
          freshUntilMs: now + freshTtl,
          staleUntilMs: now + freshTtl + staleTtl,
          staleIfErrorUntilMs: now + freshTtl + staleTtl + staleIfErrorTtl,
        };
        const ttlSeconds = Math.max(
          1,
          Math.ceil((freshTtl + staleTtl + staleIfErrorTtl) / 1000),
        );
        await safeCacheSet(buildKey(host), payload, ttlSeconds);
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
      const cached = await safeCacheGet(key);
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

      try {
        return await refresh(host);
      } catch (err) {
        // Stale-if-error: when upstream throws and we still hold a usable
        // cached value (either inside `staleIfErrorUntilMs` or — for older
        // payloads — within `staleUntilMs`), serve it rather than failing
        // closed. This is the "always fall back to the auth-servers' last
        // known routing" path.
        if (cached) {
          const errFallbackUntil =
            cached.staleIfErrorUntilMs ?? cached.staleUntilMs;
          if (errFallbackUntil > now) return cached.value;
        }
        throw err;
      }
    },
  };
}

export function buildCacheAdapterKey(keyPrefix: string, host: string): string {
  return `${keyPrefix}:${host.toLowerCase()}`;
}
