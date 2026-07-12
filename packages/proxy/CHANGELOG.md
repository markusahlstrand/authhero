# @authhero/proxy

## 0.9.2

### Patch Changes

- Updated dependencies [dbb6e70]
  - @authhero/adapter-interfaces@3.12.0

## 0.9.1

### Patch Changes

- Updated dependencies [4a549c2]
- Updated dependencies [7fb85fb]
  - @authhero/adapter-interfaces@3.11.0

## 0.9.0

### Minor Changes

- 11ef0a5: Add `createServiceBindingFetch` to route the HTTP proxy adapter's control-plane calls through a Cloudflare service binding instead of the public edge (#1079).

  When a proxy-at-edge deployment fronts the same wildcard zone its control plane resolves on (e.g. the proxy owns `*.token.example.com/*` while `CONTROL_PLANE_URL` points at a host under that wildcard), resolving the control plane over the public edge loops the adapter's `/oauth/token` and `resolveHost` calls back into the proxy — a self-DoS. `createServiceBindingFetch(env.AUTH2)` wraps a service binding as the `fetch` override on `createHttpProxyAdapter`, so those calls reach the control-plane Worker directly and the loop cannot form regardless of `baseUrl`.

  The `fetch` override already existed; this exports an ergonomic, documented helper for it and adds the proxy-at-edge cutover runbook to the deployment docs.

### Patch Changes

- Updated dependencies [0e6acf4]
  - @authhero/adapter-interfaces@3.10.0

## 0.8.5

### Patch Changes

- Updated dependencies [4867c22]
  - @authhero/adapter-interfaces@3.9.0

## 0.8.4

### Patch Changes

- Updated dependencies [378e918]
- Updated dependencies [e358192]
- Updated dependencies [ab4c324]
  - @authhero/adapter-interfaces@3.8.0

## 0.8.3

### Patch Changes

- Updated dependencies [b83ae9f]
  - @authhero/adapter-interfaces@3.7.0

## 0.8.2

### Patch Changes

- Updated dependencies [5b50504]
  - @authhero/adapter-interfaces@3.6.0

## 0.8.1

### Patch Changes

- Updated dependencies [028f2b5]
  - @authhero/adapter-interfaces@3.5.0

## 0.8.0

### Minor Changes

- 2d20db2: Add Cloudflare KV as a published read replica for proxy host resolution.

  `@authhero/proxy` gains `createKvProxyAdapter`, a `ProxyDataAdapter` that
  resolves a `Host` to its `ResolvedHost` blob with a single, unauthenticated,
  edge-local `KV.get` — a faster, more reliable alternative to the two-hop
  HTTP control-plane adapter. It slots into the existing `upstream` seam of
  `createCacheAdapterHostCache`, with `createHttpProxyAdapter` left as the
  miss / `stale-if-error` fallback during cutover. The KV binding is passed as
  a minimal structural interface, so the package keeps its zero-Cloudflare
  footprint. Also exports `buildKvHostKey` and `DEFAULT_KV_HOST_KEY_PREFIX`.

  `authhero` gains the control-plane publisher `wrapProxyAdaptersWithKvPublish`,
  which wraps the `customDomains` + `proxyRoutes` adapters so every write
  recomputes the affected host's full blob and publishes it to KV
  fire-and-forget (via `waitUntil`). Wrapping at the adapter layer makes it the
  single choke-point — pass the wrapped pair to both the management-api app
  (direct writes) and `createApplySyncEvents` (WFP `/sync`-applied writes) so KV
  stays in sync regardless of write origin. `backfillProxyHostsToKv` covers the
  one-time migration backfill and doubles as the periodic reconcile primitive.

## 0.7.5

### Patch Changes

- Updated dependencies [8c75922]
  - @authhero/adapter-interfaces@3.4.1

## 0.7.4

### Patch Changes

- Updated dependencies [9b7879c]
  - @authhero/adapter-interfaces@3.4.0

## 0.7.3

### Patch Changes

- Updated dependencies [780d524]
  - @authhero/adapter-interfaces@3.3.0

## 0.7.2

### Patch Changes

- Updated dependencies [6d19200]
  - @authhero/adapter-interfaces@3.2.0

## 0.7.1

### Patch Changes

- e0d6e50: Add `rollup` as an explicit devDependency so the build works on CI where the peer dependency of `rollup-plugin-dts` is not auto-hoisted.

## 0.7.0

### Minor Changes

- aedf807: Add `defaultHandlers` — a catch-all chain that fires when no per-host route matches AND when the control-plane resolve fails (unknown host, timeout, or error). Matches the `default` upstream semantic of the legacy file-config proxy and lets known hosts with empty `proxy_routes` rows keep serving traffic instead of returning 404, while also failing open to the default chain when the control plane is slow or unreachable.

  ```ts
  createProxyApp({
    data,
    cache: { ... },
    defaultHandlers: [
      { type: "http", options: { upstream_url: "https://auth2.sesamy.com" } },
    ],
  });
  ```

  Without `defaultHandlers` the proxy keeps its previous behavior — 404 on unknown host or no-matching-route, 504 on resolve timeout, 502 on resolve error.

  Also decouples the proxy's outer resolve-host race timeout from the HTTP adapter's per-fetch abort timeout so they no longer collide at the same 5000ms value:

  - `createHttpProxyAdapter` `timeoutMs` default: **5000 → 2500** (per fetch — token and resolveHost each get this budget)
  - `createProxyApp` / `createProxyDataPlaneHandler` `resolveHostTimeoutMs` default: **5000 → 10000** (must comfortably exceed the sum of inner fetches)

  Previously both defaulted to 5000ms; the outer race fired microseconds before the inner abort, shadowing the structured adapter errors with a generic `resolve_host_timeout` 504, and a cold isolate that had to mint a token then call resolveHost sequentially could never finish under the same ceiling it was racing against. Callers that explicitly set these values are unaffected.

### Patch Changes

- Updated dependencies [aedf807]
  - @authhero/adapter-interfaces@3.1.1

## 0.6.0

### Minor Changes

- fe4941f: Harden `@authhero/proxy` against hangs and unhandled exceptions:

  - Add per-route `timeout_ms` (default 30s) to `dispatch_namespace` and `service_binding` handlers; hung subrequests now return a clean 504 with `x-authhero-proxy-error: <handler>_timeout` instead of letting the Cloudflare runtime cancel the parent worker as `outcome: exception`.
  - Wrap every dispatched fetch (`http`, `dispatch_namespace`, `service_binding`) in try/catch; non-timeout failures now return a structured 502 with `x-authhero-proxy-error: <handler>_failed`.
  - Add an outer try/catch and a configurable `resolveHostTimeoutMs` (default 5s) ceiling to the data-plane router. Resolver hangs become 504, resolver/build errors become 502 — never an unhandled rejection.
  - Install `app.onError` on `createProxyApp` and on every compiled host app as a defense-in-depth backstop for throws that escape the router's try/catch.
  - Add `staleIfErrorTtlMs` to both `createInMemoryHostCache` and `createCacheAdapterHostCache`. When the upstream resolver throws and a previously-good value still sits within the stale-if-error window, the cache serves it instead of failing closed — the proxy keeps routing to the last-known-good upstream even when the control plane is unreachable.
  - Add tight per-call timeouts (default 1s read / 1s write) on `CacheAdapter` and Cache-API calls. A stuck KV/D1/Redis/Cache-API call now falls through to the upstream resolver instead of hanging the request. Cache writes inside `createCacheAdapterHostCache` are fire-and-forget via `waitUntil` when provided.
  - Fix an in-memory cache race where `placeholder.refreshing` was assigned after the placeholder entered the map, briefly allowing concurrent callers to fire duplicate upstream fetches.

## 0.5.1

### Patch Changes

- Updated dependencies [429f88a]
  - @authhero/adapter-interfaces@3.1.0

## 0.5.0

### Minor Changes

- ac8a7a2: Add `createCacheAdapterHostCache` — a generic stale-while-revalidate wrapper around any `CacheAdapter` from `@authhero/adapter-interfaces`. Pair with `createCloudflareCache` from `@authhero/cloudflare-adapter` (or any other `CacheAdapter` implementation) to share host-resolution cache across Worker isolates / colos with proper SWR semantics.

  ```ts
  import {
    createCacheAdapterHostCache,
    createInMemoryHostCache,
  } from "@authhero/proxy";
  import { createCloudflareCache } from "@authhero/cloudflare-adapter";

  const resolver = createCacheAdapterHostCache({
    upstream: createInMemoryHostCache(data, { freshTtlMs: 60_000 }),
    cache: createCloudflareCache({ cacheName: "authhero-proxy-hosts" }),
    freshTtlMs: 60 * 60_000, // 1 hour fresh
    staleTtlMs: 23 * 60 * 60_000, // SWR for 23 more hours (24h total)
    waitUntil: (p) => ctx.waitUntil(p),
  });

  createProxyApp({ data, resolver });
  ```

  Also adds the missing `resolver?: HostResolverCache` field to `ProxyAppOptions` so it can be passed through `createProxyApp` (was already accepted by the lower-level `createProxyDataPlaneHandler`).

  `createCacheApiHostCache` is now marked `@deprecated` in favor of the new wrapper — it remains exported for now and continues to work, but new code should use `createCacheAdapterHostCache(createCloudflareCache(...))`.

- ac8a7a2: Make `proxyControlPlane` authentication opinionated. The host callback
  (`authenticate: (request: Request) => Promise<boolean> | boolean`) is removed;
  authhero now verifies the bearer JWT internally.

  **Breaking** — `AuthHeroConfig.proxyControlPlane` shape changed:

  ```diff
   proxyControlPlane: {
     resolveHost,
  -  authenticate: (req) => { /* host-supplied JWKS+iss+scope check */ },
  +  jwksUrl: `${env.ISSUER}/.well-known/jwks.json`,
  +  jwksFetch: (url) => env.JWKS_SERVICE.fetch(url), // optional
     applySyncEvents,
   }
  ```

  Verifier behavior: accepts RS256/384/512 and ES256/384/512; requires the
  `proxy:resolve_host` scope; matches `iss` against the runtime `env.ISSUER`
  via strict URL equality after trailing-slash normalization (no host-only or
  subdomain match — `https://issuer.example.com/` is _not_ equivalent to
  `https://other.example.com/` or `https://issuer.example.com/path/`).

  `@authhero/proxy` now exports `PROXY_RESOLVE_HOST_SCOPE` so client and server
  share the constant, and `createHttpProxyAdapter` requests this scope in its
  `client_credentials` grant (overridable via the new `scope` option).

## 0.4.5

### Patch Changes

- Updated dependencies [3482bd3]
- Updated dependencies [8b8b117]
  - @authhero/adapter-interfaces@3.0.0

## 0.4.4

### Patch Changes

- Updated dependencies [d45a6b6]
  - @authhero/adapter-interfaces@2.13.1

## 0.4.3

### Patch Changes

- Updated dependencies [7a0606f]
  - @authhero/adapter-interfaces@2.13.0

## 0.4.2

### Patch Changes

- Updated dependencies [64e5f01]
  - @authhero/adapter-interfaces@2.12.0

## 0.4.1

### Patch Changes

- Updated dependencies [b195d31]
- Updated dependencies [9149210]
  - @authhero/adapter-interfaces@2.11.0

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
