---
"@authhero/cloudflare-adapter": patch
---

Make WFP dispatch failures legible instead of opaque control-plane 500s.

`createWfpForwardMiddleware` previously let a failed dispatch throw straight up: a tenant worker missing from the namespace, or one that failed to boot, surfaced as a generic `{"message":"Internal Server Error"}` that named neither the tenant nor the script. Debugging meant guessing which `wrangler tail` to attach.

Now the middleware:

- Catches dispatch-level throws and returns a structured, tenant-scoped error — `503 wfp_worker_not_found` when the tenant's script isn't in the dispatch namespace, `502 wfp_dispatch_failed` otherwise — carrying the same `X-Authhero-Error: <code>` header convention the tenant worker uses, plus the cause logged on the control plane.
- Logs any dispatched `5xx` with the tenant id, script name, and the tenant worker's own `X-Authhero-Error` code (when present), so an opaque worker 500 is at least traceable from the control plane.
- Tags every dispatched response with `X-Wfp-Tenant` so an operator can tell, from the response alone, that a request was served by a tenant worker and which one.
