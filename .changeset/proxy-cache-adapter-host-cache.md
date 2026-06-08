---
"@authhero/proxy": minor
---

Add `createCacheAdapterHostCache` — a generic stale-while-revalidate wrapper around any `CacheAdapter` from `@authhero/adapter-interfaces`. Pair with `createCloudflareCache` from `@authhero/cloudflare-adapter` (or any other `CacheAdapter` implementation) to share host-resolution cache across Worker isolates / colos with proper SWR semantics.

```ts
import { createCacheAdapterHostCache, createInMemoryHostCache } from "@authhero/proxy";
import { createCloudflareCache } from "@authhero/cloudflare-adapter";

const resolver = createCacheAdapterHostCache({
  upstream: createInMemoryHostCache(data, { freshTtlMs: 60_000 }),
  cache: createCloudflareCache({ cacheName: "authhero-proxy-hosts" }),
  freshTtlMs: 60 * 60_000,           // 1 hour fresh
  staleTtlMs: 23 * 60 * 60_000,      // SWR for 23 more hours (24h total)
  waitUntil: (p) => ctx.waitUntil(p),
});

createProxyApp({ data, resolver });
```

Also adds the missing `resolver?: HostResolverCache` field to `ProxyAppOptions` so it can be passed through `createProxyApp` (was already accepted by the lower-level `createProxyDataPlaneHandler`).

`createCacheApiHostCache` is now marked `@deprecated` in favor of the new wrapper — it remains exported for now and continues to work, but new code should use `createCacheAdapterHostCache(createCloudflareCache(...))`.
