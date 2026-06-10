import { ProxyDataAdapter, ResolvedHost } from "../adapter";

interface CacheEntry {
  value: ResolvedHost | null;
  fresh_until: number;
  stale_until: number;
  // Soft expiry: after `stale_until`, the value is only served if the upstream
  // refresh throws. Bounded by `staleIfErrorTtlMs`.
  stale_if_error_until: number;
  refreshing?: Promise<ResolvedHost | null>;
}

export interface HostResolverCache {
  resolveHost(host: string): Promise<ResolvedHost | null>;
}

export interface HostCacheOptions {
  freshTtlMs: number;
  // Extra window past fresh_until during which the cached value is served
  // immediately while a background refresh runs (stale-while-revalidate).
  staleTtlMs?: number;
  // Extra window past stale_until during which a previously-cached value is
  // served *only* if the upstream refresh throws. Lets the proxy degrade
  // gracefully when the control plane is unreachable instead of failing
  // closed. Defaults to 0 (disabled).
  staleIfErrorTtlMs?: number;
  // Separate (usually shorter) cache window for null results so a host added
  // after a miss becomes reachable quickly.
  negativeTtlMs?: number;
  maxEntries?: number;
  // Worker context hook: when serving stale, the background refresh promise
  // is passed here so the runtime keeps the request alive until it finishes.
  waitUntil?: (promise: Promise<unknown>) => void;
}

const DEFAULT_MAX_ENTRIES = 10_000;

export function createInMemoryHostCache(
  data: ProxyDataAdapter,
  ttlMs: number,
  maxEntries?: number,
): HostResolverCache;
export function createInMemoryHostCache(
  data: ProxyDataAdapter,
  options: HostCacheOptions,
): HostResolverCache;
export function createInMemoryHostCache(
  data: ProxyDataAdapter,
  optsOrTtl: number | HostCacheOptions,
  legacyMaxEntries?: number,
): HostResolverCache {
  const options: HostCacheOptions =
    typeof optsOrTtl === "number"
      ? { freshTtlMs: optsOrTtl, maxEntries: legacyMaxEntries }
      : optsOrTtl;

  const freshTtl = options.freshTtlMs;
  const staleTtl = options.staleTtlMs ?? 0;
  const staleIfErrorTtl = options.staleIfErrorTtlMs ?? 0;
  const negativeTtl = options.negativeTtlMs ?? freshTtl;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const waitUntil = options.waitUntil;

  const cache = new Map<string, CacheEntry>();

  function evict(now: number): void {
    for (const [key, entry] of cache) {
      // Only drop entries that are past every fallback window AND not actively
      // refreshing. Anything still within `stale_if_error_until` may be needed
      // by a future request whose upstream refresh fails.
      if (
        entry.stale_if_error_until <= now &&
        entry.stale_until <= now &&
        !entry.refreshing
      ) {
        cache.delete(key);
      }
    }
    while (cache.size >= maxEntries) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }

  function store(
    host: string,
    value: ResolvedHost | null,
    now: number,
  ): CacheEntry {
    const fresh_until = now + (value === null ? negativeTtl : freshTtl);
    const stale_until = value === null ? fresh_until : fresh_until + staleTtl;
    // Don't extend the stale-if-error window for negative results — letting an
    // old "host unknown" answer outlive the configured negative TTL would
    // permanently shadow a newly-registered host.
    const stale_if_error_until =
      value === null ? stale_until : stale_until + staleIfErrorTtl;
    const entry: CacheEntry = {
      value,
      fresh_until,
      stale_until,
      stale_if_error_until,
    };
    cache.delete(host);
    evict(now);
    cache.set(host, entry);
    return entry;
  }

  function refresh(host: string): Promise<ResolvedHost | null> {
    const existing = cache.get(host);
    if (existing?.refreshing) return existing.refreshing;

    // Reserve a placeholder so concurrent misses await the same fetch.
    const placeholder: CacheEntry = existing ?? {
      value: null,
      fresh_until: 0,
      stale_until: 0,
      stale_if_error_until: 0,
    };

    const p = (async () => {
      try {
        const value = await data.resolveHost(host);
        store(host, value, Date.now());
        return value;
      } catch (err) {
        const cur = cache.get(host);
        if (cur) {
          cur.refreshing = undefined;
          // If we never had a real value, drop the placeholder so the next
          // request retries instead of treating absence as cached. Keep the
          // entry around if it still holds a usable value for the
          // stale-if-error fallback in `resolveHost`.
          if (cur.stale_if_error_until <= Date.now()) cache.delete(host);
        }
        throw err;
      }
    })();
    // Assign `refreshing` BEFORE the placeholder becomes visible to concurrent
    // callers — otherwise the window between `cache.set` and this line lets a
    // racing reader miss the dedup pointer and fire its own upstream fetch.
    placeholder.refreshing = p;

    if (!existing) {
      evict(Date.now());
      cache.set(host, placeholder);
    }

    return p;
  }

  return {
    async resolveHost(host: string) {
      const now = Date.now();
      const cached = cache.get(host);

      if (cached && cached.fresh_until > now) {
        // Refresh LRU position so hot keys survive eviction.
        cache.delete(host);
        cache.set(host, cached);
        return cached.value;
      }

      if (cached && cached.stale_until > now) {
        cache.delete(host);
        cache.set(host, cached);
        if (!cached.refreshing) {
          const p = refresh(host).catch(() => undefined);
          if (waitUntil) waitUntil(p);
        }
        return cached.value;
      }

      // Past every cache window — must await upstream. If the upstream throws
      // and we still hold a value within the stale-if-error window, serve it
      // rather than letting the request fail closed.
      try {
        return await refresh(host);
      } catch (err) {
        if (cached && cached.stale_if_error_until > now) {
          return cached.value;
        }
        throw err;
      }
    },
  };
}
