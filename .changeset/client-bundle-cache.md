---
"authhero": minor
"@authhero/cloudflare-adapter": patch
---

Introduce a three-layer cache stack for the auth-api request path:

- **L0 — ClientBundle (`withClientBundle`)**: per-(tenant_id, client_id) snapshot of tenant, client, connections, clientConnections, branding, resourceServers, promptSettings, and hooks. One cache key per request instead of 8+. SWR semantics: 5min fresh, 10min stale window served while a background refresh fires via `executionCtx.waitUntil`.
- **L1 — Request-scoped dedup (`addRequestScopedDedup`)**: in-flight Promise memoization per request, so duplicate reads inside one request (e.g. `tenants.get` called from both the middleware and a helper) share a single round-trip. Opt-in by entity — applied only to stable config entities (the same set L2 caches). Transactional entities (sessions, codes, loginSessions, refreshTokens, users, clientGrants, logs) pass through without memoization to avoid serving stale data after a `trx.*` write that bypasses the wrapper.
- **L2 — Existing `addCaching`**: unchanged cross-request cache for the long tail outside the bundle.

Bundle-covered entity writes (in both auth-api and management-api) now best-effort purge the matching `client-bundle:{tenant_id}:{client_id}` cache key. On Cloudflare Cache this only affects the local edge; remote edges wait for TTL.

Also adds a configurable timeout (`getTimeoutMs`, default 200ms) to `CloudflareCache.get()` so a stalled `caches.default.match()` falls back to a cache miss instead of pinning the worker for up to its wall-time limit.
