# @authhero/proxy

## 0.3.0

### Minor Changes

- 1b7a39b: Strip the package down to the data plane. `@authhero/proxy` now ships only the adapter contract (`ProxyDataAdapter`), the HTTP data-plane app (`createProxyApp`, `createProxyDataPlaneRouter`, `createProxyDataPlaneHandler`, host cache), and the in-memory `createStaticProxyAdapter`. It can be initialized with just a JSON config blob and has no peer dependency on `kysely`.

  Breaking — removed exports:
  - `createKyselyProxyDataAdapter`, `runMigrations`, `migrateDown`, `ProxyDatabase`, `ProxyRoutesTable` — the Kysely backing is now folded into [`@authhero/kysely-adapter`](https://npmjs.com/package/@authhero/kysely-adapter) as `createProxyDataAdapter`, and the `proxy_routes` table is part of its standard migrations.
  - `createProxyManagementRouter`, `ProxyManagementOptions` — route CRUD lives in the AuthHero core management API at `/api/v2/proxy-routes`.

- 1b7a39b: Proxy v2: replace the legacy `path_pattern` + `upstream_type` + fixed two-phase middleware model with a JSON-configured route schema (`match` + ordered `handlers`) and a Hono-native execution model. Routes now match on path **plus** method, host pattern (`*.example.com`), request headers, and query params. Handlers are composable `(c, next) => Response` middleware compiled into a per-host Hono sub-app — they can short-circuit, reorder (e.g. `cache` before `basic_auth`), and post-process responses. Built-in handlers cover the legacy custom-domains proxy: `http`, `service_binding` (Cloudflare bindings via the new `bindings` option on `createProxyApp`), `redirect`, `static`, `cors`, `basic_auth`, `headers`, `cache`, `forwarded_headers` (X-Real-IP / X-Original-URL / X-Forwarded-\*), `rewrite_cookies` (upstream `Domain=`), and `rewrite_location` (3xx Location origin). New `createHttpProxyAdapter` reads route config from a remote AuthHero control plane over `client_credentials`, with an optional `createCacheApiHostCache` layer that uses `caches.default` for per-colo warmth (no KV needed). AuthHero exposes the privileged `GET /api/v2/proxy/control-plane/hosts/:host` endpoint via the new `proxyControlPlane` config option. Kysely and Drizzle adapters ship forward migrations that backfill existing rows; the legacy `path_pattern`/`upstream_type`/`upstream_url`/`preserve_host`/`middleware` columns are replaced with JSON `match` and `handlers`.

### Patch Changes

- Updated dependencies [1b7a39b]
- Updated dependencies [1b7a39b]
  - @authhero/adapter-interfaces@2.8.0

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
