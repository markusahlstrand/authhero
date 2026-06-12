---
"authhero": minor
"@authhero/cloudflare-adapter": patch
---

Introduce a three-layer cache stack for every authenticated request path (auth-api, universal-login v1 + v2, SAML), composed via a new `composeAuthData` helper so all entry points share one layer order:

- **L0 — ClientBundle (`withClientBundle`)**: per-(tenant_id, client_id) snapshot of tenant, client, connections, clientConnections, branding, resourceServers, promptSettings, hooks, and the tenant's default theme. One cache key per request instead of 9+. SWR semantics: 5min fresh, 10min stale window served while a background refresh fires via `executionCtx.waitUntil`. `themes.create/update/remove` purge the bundle alongside the other tenant-scoped writes.
- **L1 — Request-scoped dedup (`addRequestScopedDedup`)**: in-flight Promise memoization per request, so duplicate reads inside one request (e.g. `tenants.get` called from both the middleware and a helper) share a single round-trip. Opt-in by entity — applied only to stable config entities (the same set L2 caches). Transactional entities (sessions, codes, loginSessions, refreshTokens, users, clientGrants, logs) pass through without memoization to avoid serving stale data after a `trx.*` write that bypasses the wrapper.
- **L2 — Existing `addCaching`**: cross-request cache for the long tail outside the bundle. Bundle-covered entities are mostly excluded from L2 — the bundle is their canonical cross-request cache, and double-caching them under per-entity keys would waste edge storage and create a second invalidation surface. The `BUNDLE_ENTITIES` constant lives next to the bundle implementation; each app declares only its `nonBundleEntities`. The one bundle entity that stays in L2 is `clients`, because `prefetchClientBundle` calls `clients.getByClientId(cid)` before `ctx.var.client_id` is set and the wrapper can't route it to the bundle yet.

The hot-path `hooks.list(tid, {q: "trigger_id:…"})` call sites in `authentication-flows/common.ts`, `hooks/user-update.ts`, and `hooks/user-registration.ts` are converted to fetch the full tenant hooks list (bundle-covered) and filter in memory by `trigger_id`. This lets `hooks` move entirely under the bundle — no L2 fallback needed.

Bundle-covered entity writes (in both auth-api and management-api) now best-effort purge the matching `client-bundle:{tenant_id}:{client_id}` cache key. On Cloudflare Cache this only affects the local edge; remote edges wait for TTL.

Explicit `prefetchClientBundle` helper warms the bundle at the top of every request handler that already knows (or can cheaply discover) its `client_id`. Wired into `/authorize`, `/oauth/token`, `/callback`, `/oidc/logout`, `/v2/logout`, `/co/account`, `/passwordless/start`, `/co/authenticate`, `/oauth/revoke`, the universal-login v1+v2 `initJSXRoute` helper, and two u2 ticket/invite flows. Failures are swallowed so the downstream route still handles real "client not found" with its proper error contract. Skipped for CIMD clients (URL-based client_ids that resolve out-of-band).

Also adds a configurable timeout (`getTimeoutMs`, default 200ms) to `CloudflareCache.get()` so a stalled `caches.default.match()` falls back to a cache miss instead of pinning the worker for up to its wall-time limit.
