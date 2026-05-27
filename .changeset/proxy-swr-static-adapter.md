---
"@authhero/proxy": minor
---

Add stale-while-revalidate caching and a static (in-process JSON) adapter so the proxy can run without a database.

- `createInMemoryHostCache` now accepts a `{ freshTtlMs, staleTtlMs?, negativeTtlMs?, waitUntil?, maxEntries? }` options object. After `freshTtlMs` elapses the cached value is served immediately for an additional `staleTtlMs` window while a single-flight background refresh runs; null lookups have their own (usually shorter) `negativeTtlMs`. On Workers, wire `ctx.waitUntil` so background refreshes survive the response. The legacy `(data, ttlMs, maxEntries?)` signature still works.
- `createProxyApp` / `createProxyDataPlaneHandler` accept a new `cache` option that is forwarded to the resolver cache.
- New `createStaticProxyAdapter({ hosts: { "id.example.com": { tenant_id, routes: [...] } } })` materializes routes from an in-memory map. Useful for thin proxy deployments that don't need the management API or a database; write operations on `proxyRoutes` throw.
