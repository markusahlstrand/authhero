---
"@authhero/proxy": minor
---

Add `defaultHandlers` — a catch-all chain that fires when no per-host route matches AND when the control-plane resolve fails (unknown host, timeout, or error). Matches the `default` upstream semantic of the legacy file-config proxy and lets known hosts with empty `proxy_routes` rows keep serving traffic instead of returning 404, while also failing open to the default chain when the control plane is slow or unreachable.

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
