# @authhero/proxy

## 0.4.0

### Minor Changes

- 6f4477f: Add a `dispatch_namespace` terminal handler that routes requests to Cloudflare Workers for Platforms. Given a dispatch namespace binding name and a script name (which may include `{tenant_id}`, `{custom_domain_id}`, `{domain}`, or `{host}` placeholders), the handler resolves the script at request time and invokes `env[binding].get(scriptName).fetch(request)`. Optional `cpu_ms` and `subrequests` options are forwarded as dispatcher limits.

  The compiled host app now exposes the resolved `tenant_id`, `custom_domain_id`, and `domain` via the Hono context, accessible from custom handlers through new `getProxyTenantId` / `getProxyCustomDomainId` / `getProxyDomain` helpers in `handlers/util.ts`. `compileHostApp()` gains an optional third argument; existing callers continue to work unchanged.

## 0.3.3

### Patch Changes

- 3bef633: Fix `TypeError: Can't modify immutable headers` 500s in the data-plane router on Cloudflare Workers.

  Response objects returned by `fetch()` on Workers (and Miniflare/`wrangler dev --local`) have immutable headers — calling `set`/`append`/`delete` on them throws. The response-phase handlers `rewrite_location`, `rewrite_cookies`, `headers`, `cors`, and `cache` all mutated `c.res.headers` in place, which crashed the worker on any upstream response that triggered them (e.g. a 3xx with a Location header through `rewrite_location`).

  Tests passed because Hono's `app.request(...)` constructs Responses in-process where headers are mutable; only real Workers traffic hit the constraint.

  Each handler now calls a new `ensureMutableResponseHeaders(c)` helper before mutating, which swaps `c.res` for a copy whose headers are a writable `new Headers(...)` (no-op when already mutable). Regression tests simulate the Workers constraint by freezing the fetch-returned Response's header mutators and exercising each handler end-to-end.

- Updated dependencies [3bef633]
  - @authhero/adapter-interfaces@2.10.0

## 0.3.2

### Patch Changes

- Updated dependencies [1fb1bd1]
  - @authhero/adapter-interfaces@2.9.1

## 0.3.1

### Patch Changes

- Updated dependencies [8b9ef23]
  - @authhero/adapter-interfaces@2.9.0

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
