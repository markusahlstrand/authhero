---
"authhero": minor
"@authhero/cloudflare-adapter": patch
---

Move the WfP admin-request dispatch inside authhero's management-API pipeline so
CORS is handled centrally (#969).

- `authhero`: new optional `tenantDispatch` config — a Hono `MiddlewareHandler`
  mounted in the management API **after** the CORS middleware and **before** the
  auth/data chain. When it forwards a request to a tenant's worker (returning
  that worker's `Response`), the central CORS middleware now applies the
  `Access-Control-Allow-*` headers automatically, so host apps no longer need to
  re-apply CORS to dispatched responses. When it falls through (calls `next()`),
  the request is served locally as before.
- `@authhero/cloudflare-adapter`: `createWfpForwardMiddleware` now also gates on
  `provisioning_state` — a `wfp` tenant that is still `pending` (or `failed`)
  falls through to local serving instead of dispatching to a not-yet-deployed
  worker. Pass it as `tenantDispatch` to `init()` instead of mounting it outside
  the authhero app.
