import { ProxyDataAdapter, ResolvedHost } from "../adapter";
import { withRaceTimeout } from "./timeout";

interface CacheEntry {
  value: ResolvedHost | null;
  fresh_until: number;
  stale_until: number;
  // Soft expiry: after `stale_until`, the value is only served if the upstream
  // refresh throws. Bounded by `staleIfErrorTtlMs`.
  stale_if_error_until: number;
  // When the most recent upstream refresh for this host was started, used to
  // damp background-refresh stampedes during the stale window. Deliberately a
  // timestamp and NOT the pending promise: a promise created by one request is
  // tied to that request's I/O context, so once that request ends the promise
  // may never settle, and anything that later awaited it would hang forever.
  // A number cannot strand, and the guard below self-heals on a clock read.
  refresh_started_at?: number;
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
  // Deadline (ms) on a single `data.resolveHost()` call. Without one, an
  // upstream that answers neither way holds the caller until the router's
  // outer ceiling fires, and the `staleIfErrorTtlMs` fallback below is never
  // reached — the value is sitting right there, but nothing ever throws to go
  // and get it. Defaults to 8000: comfortably under the router's 10s ceiling,
  // and above the 5s default of `createCacheAdapterHostCache` so that when the
  // two are nested the inner layer gives up first and gets to serve its own
  // stale value. Set to 0 to disable.
  upstreamTimeoutMs?: number;
}

const DEFAULT_MAX_ENTRIES = 10_000;
const DEFAULT_UPSTREAM_TIMEOUT_MS = 8_000;

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
  const upstreamTimeout =
    options.upstreamTimeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS;
  // How long a started refresh is assumed to still be running. Tied to the
  // upstream deadline, so it always outlives a healthy refresh and always
  // expires after a stranded one.
  const guardWindow = upstreamTimeout > 0 ? upstreamTimeout : 10_000;

  const cache = new Map<string, CacheEntry>();

  function evict(now: number): void {
    for (const [key, entry] of cache) {
      // Only drop entries that are past every fallback window. Anything still
      // within `stale_if_error_until` may be needed by a future request whose
      // upstream refresh fails. Nothing else pins an entry — an in-flight
      // refresh used to, via a promise that a stranded request could leave set
      // forever, which made the entry both unservable and unevictable.
      if (entry.stale_if_error_until <= now && entry.stale_until <= now) {
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

  // True while an upstream refresh for `host` plausibly remains in flight.
  // Purely advisory — it damps stampedes of background refreshes and is never
  // awaited. Once the guard window lapses the entry is treated as idle again,
  // so a refresh whose request died can never wedge the host permanently.
  //
  // Best-effort by design, and not owned by any one refresh: a slow refresh
  // that finishes after a newer one started can clear the newer one's mark.
  // The cost of losing it is a single extra background refresh, which is far
  // cheaper than the concurrency this cache already allows on a cold miss,
  // where every caller goes upstream on its own.
  function refreshInFlight(entry: CacheEntry, now: number): boolean {
    if (entry.refresh_started_at === undefined) return false;
    if (now - entry.refresh_started_at < guardWindow) return true;
    entry.refresh_started_at = undefined;
    return false;
  }

  function callUpstream(host: string): Promise<ResolvedHost | null> {
    const p = data.resolveHost(host);
    return upstreamTimeout > 0
      ? withRaceTimeout(p, upstreamTimeout, "resolveHost")
      : p;
  }

  // Each caller runs its own upstream call. Concurrent misses for the same host
  // therefore cost a few duplicate fetches on a cold isolate, which is cheap
  // next to the alternative: sharing one pending promise between requests, so
  // that a single stranded refresh hangs every later request in the isolate.
  async function refresh(host: string): Promise<ResolvedHost | null> {
    const entry = cache.get(host);
    if (entry) entry.refresh_started_at = Date.now();

    try {
      const value = await callUpstream(host);
      store(host, value, Date.now());
      return value;
    } catch (err) {
      const cur = cache.get(host);
      if (cur) {
        cur.refresh_started_at = undefined;
        // Keep the entry if it still holds a usable value for the
        // stale-if-error fallback in `resolveHost`; otherwise drop it so the
        // next request retries instead of treating absence as cached.
        if (cur.stale_if_error_until <= Date.now()) cache.delete(host);
      }
      throw err;
    }
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
        if (!refreshInFlight(cached, now)) {
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
