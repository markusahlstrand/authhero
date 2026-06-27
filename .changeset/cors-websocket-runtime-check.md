---
"authhero": patch
"@authhero/cloudflare-adapter": patch
---

Fix management-API CORS headers missing on every actual request in the
Cloudflare Workers runtime.

The CORS middleware (and the WFP forward middleware) detected a WebSocket
upgrade with `"webSocket" in res`. The Workers runtime defines a `webSocket`
property — value `null` — on *every* `Response`, so that check was always true
in production: the actual-request CORS block (`Vary: Origin` plus the
`Access-Control-*` headers) was skipped for all non-preflight responses, while
preflight kept working. The bug was invisible to tests because Node's `Response`
has no `webSocket` property. Detection now requires a non-null `webSocket`
handle (or status 101).
