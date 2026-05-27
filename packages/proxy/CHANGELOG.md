# @authhero/proxy

## 0.2.0

### Minor Changes

- 28a6135: Initial release of `@authhero/proxy`: a Hono-based reverse proxy library for fronting custom domains. Shipped as a library (no deploy artifact) — consumers write a thin Worker entry that calls `createProxyApp({ data, management? })`, mirroring how `authhero` is consumed.

  Highlights:
  - `createProxyApp` factory mounts a data-plane catch-all on `/*` and an optional management API (default `/__proxy/routes`) so both can run in the same Worker, or you can keep them split — e.g. management API mounted inside your AuthHero deploy at `/api/v2/proxy-routes`, with the actual proxy data plane running on a separate domain/Cloudflare account.
  - `ProxyDataAdapter` interface with a kysely implementation; per-domain `proxy_routes` joined against the existing `custom_domains` table.
  - Built-in middleware: CORS, header rewrite, basic auth, response cache headers.
  - Own migration set using a `kysely_migration_proxy` log table so it can share a database with AuthHero without colliding.

- ac2d7b9: Add stale-while-revalidate caching and a static (in-process JSON) adapter so the proxy can run without a database.
  - `createInMemoryHostCache` now accepts a `{ freshTtlMs, staleTtlMs?, negativeTtlMs?, waitUntil?, maxEntries? }` options object. After `freshTtlMs` elapses the cached value is served immediately for an additional `staleTtlMs` window while a single-flight background refresh runs; null lookups have their own (usually shorter) `negativeTtlMs`. On Workers, wire `ctx.waitUntil` so background refreshes survive the response. The legacy `(data, ttlMs, maxEntries?)` signature still works.
  - `createProxyApp` / `createProxyDataPlaneHandler` accept a new `cache` option that is forwarded to the resolver cache.
  - New `createStaticProxyAdapter({ hosts: { "id.example.com": { tenant_id, routes: [...] } } })` materializes routes from an in-memory map. Useful for thin proxy deployments that don't need the management API or a database; write operations on `proxyRoutes` throw.
