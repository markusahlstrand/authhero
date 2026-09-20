---
title: Proxy — Host caching
description: Host-resolution caching for @authhero/proxy — in-memory SWR and pluggable CacheAdapter (Cloudflare Cache API, Redis) for cross-isolate hits.
---

# Host cache

`resolveHost` runs on every request. Two cache implementations ship:

## In-memory (default)

Per-Worker LRU with stale-while-revalidate.

```typescript
import { createProxyApp } from "@authhero/proxy";

createProxyApp({
  data,
  cache: {
    freshTtlMs: 5 * 60_000,        // serve cached for 5 min
    staleTtlMs: 60 * 60_000,       // then SWR for 1 hr
    negativeTtlMs: 30_000,         // cache "not found" briefly
    maxEntries: 10_000,
    waitUntil: (p) => ctx.waitUntil(p), // optional, for background refresh
  },
});
```

On Cloudflare Workers, thread `ExecutionContext.waitUntil` through (e.g. via `AsyncLocalStorage`) so background refreshes survive the response.

## Pluggable `CacheAdapter` (cross-instance, stale-while-revalidate)

For larger deployments where you want cache hits across Worker isolates, wrap any `CacheAdapter` (the generic key/value cache interface from `@authhero/adapter-interfaces`) with `createCacheAdapterHostCache`. It adds stale-while-revalidate on top of whatever backing cache you plug in — Cloudflare's Cache API, Redis, in-memory, anything.

```typescript
import {
  createProxyApp,
  createCacheAdapterHostCache,
  createInMemoryHostCache,
} from "@authhero/proxy";
import { createCloudflareCache } from "@authhero/cloudflare-adapter";

const inMemory = createInMemoryHostCache(data, {
  freshTtlMs: 60_000,
  staleTtlMs: 5 * 60_000,
});

const resolver = createCacheAdapterHostCache({
  upstream: inMemory,
  cache: createCloudflareCache({ cacheName: "authhero-proxy-hosts" }),
  freshTtlMs: 60 * 60_000,           // 1 hour fresh
  staleTtlMs: 23 * 60 * 60_000,      // SWR for 23 more hours (24h total)
  negativeTtlMs: 60_000,             // cache "not found" briefly
  waitUntil: (p) => ctx.waitUntil(p),
});

createProxyApp({ data, resolver });
```

Two-tier shape: in-memory (per-isolate) → `CacheAdapter` (per-colo / cross-isolate) → DB. The adapter wrapper handles SWR — stale entries are served immediately while a background refresh updates the cache.

When you control the proxy upstream and want hits shared across colos, pair this with `@authhero/cloudflare-adapter`'s `createCloudflareCache` (Cloudflare [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/) under the hood).

## Upstream deadlines

Both cache layers put a deadline on the `resolveHost` call they make — `upstreamTimeoutMs`, defaulting to 8000 ms in-memory and 5000 ms in the `CacheAdapter` layer. The inner layer is the shorter of the two on purpose: when they are nested it gives up first, so it still gets to serve its own stale value before the outer one intervenes. Both sit under the router's 10 s `resolveHostTimeoutMs` ceiling. Set either to `0` to disable.

Without a deadline, an upstream that answers neither way holds the request open until that outer ceiling fires, and `staleIfErrorTtlMs` is never reached — the last known-good value is sitting in the cache, but nothing ever throws to go and get it.

Neither layer shares a pending refresh between callers, so concurrent misses for the same host each call the upstream. That is deliberate. On Workers a promise belongs to the request that created it: once that request ends the promise may never settle, and on the old shared-promise design every later request in the isolate that awaited it hung with it — permanently, since only the promise settling ever cleared the pointer. A handful of duplicate fetches on a cold isolate is much cheaper. Background refreshes during the stale window are still damped, by a timestamp rather than a promise.

> The earlier `createCacheApiHostCache` helper is still exported but **deprecated** — it only does TTL caching without SWR. Migrate to `createCacheAdapterHostCache(createCloudflareCache(...))` for the same Cloudflare-backed cache plus SWR.
