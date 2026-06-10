---
"@authhero/proxy": minor
---

Harden `@authhero/proxy` against hangs and unhandled exceptions:

- Add per-route `timeout_ms` (default 30s) to `dispatch_namespace` and `service_binding` handlers; hung subrequests now return a clean 504 with `x-authhero-proxy-error: <handler>_timeout` instead of letting the Cloudflare runtime cancel the parent worker as `outcome: exception`.
- Wrap every dispatched fetch (`http`, `dispatch_namespace`, `service_binding`) in try/catch; non-timeout failures now return a structured 502 with `x-authhero-proxy-error: <handler>_failed`.
- Add an outer try/catch and a configurable `resolveHostTimeoutMs` (default 5s) ceiling to the data-plane router. Resolver hangs become 504, resolver/build errors become 502 — never an unhandled rejection.
- Install `app.onError` on `createProxyApp` and on every compiled host app as a defense-in-depth backstop for throws that escape the router's try/catch.
- Add `staleIfErrorTtlMs` to both `createInMemoryHostCache` and `createCacheAdapterHostCache`. When the upstream resolver throws and a previously-good value still sits within the stale-if-error window, the cache serves it instead of failing closed — the proxy keeps routing to the last-known-good upstream even when the control plane is unreachable.
- Add tight per-call timeouts (default 1s read / 1s write) on `CacheAdapter` and Cache-API calls. A stuck KV/D1/Redis/Cache-API call now falls through to the upstream resolver instead of hanging the request. Cache writes inside `createCacheAdapterHostCache` are fire-and-forget via `waitUntil` when provided.
- Fix an in-memory cache race where `placeholder.refreshing` was assigned after the placeholder entered the map, briefly allowing concurrent callers to fire duplicate upstream fetches.
