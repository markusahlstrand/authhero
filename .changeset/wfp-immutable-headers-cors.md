---
"@authhero/cloudflare-adapter": patch
"authhero": patch
---

Fix 500 on every WFP-dispatched admin request caused by immutable response headers.

`createWfpForwardMiddleware` now re-wraps the dispatched tenant-worker response (`new Response(res.body, res)`) so its headers are mutable, instead of returning the immutable `fetch()`/Workers-for-Platforms response straight through. A 101 Switching Protocols / WebSocket upgrade is passed through untouched. As defense-in-depth, authhero core's management-API CORS middleware now tolerates an immutable upstream response, re-wrapping it before appending `Vary`/`Access-Control-*` rather than throwing "Can't modify immutable headers."
