---
"authhero": patch
---

Copy `ctx.env` per request before writing to it. Cloudflare Workers pass the same `env` object to every request in an isolate, and the routes store each request's adapter stack on `ctx.env.data`. Concurrent requests overwrote each other's stack, so one request could wait on another request's in-flight promises. The runtime then cancelled it with "Worker's code had hung", which showed up behind the proxy as `service_binding_timeout` 504s.
