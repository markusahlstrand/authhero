---
"@authhero/cloudflare-adapter": minor
---

WFP control-plane sync: service bindings, dispatch push, forward middleware, and
a pure-push tenant-worker scaffold.

- `ScriptBinding` now accepts `type: "service"` (with `service` target script
  name and optional `environment`) alongside `d1` / `plain_text` / `secret_text`.
  `createCloudflareWfpD1Provisioner` gains an `extraBindings` option, appended
  after the default `AUTH_DB` + `CONTROL_PLANE_BASE_URL` bindings.
- `createWfpForwardMiddleware` (main entry) — Hono middleware that forwards a
  resolved tenant's request to its WFP worker over a dispatch namespace; control
  plane / shared / unknown tenants fall through to the local app.
- New `@authhero/cloudflare-adapter/wfp` subpath:
  - `createDispatchSyncDefaults` — builds a control-plane defaults payload and
    **pushes** it to a tenant worker's `/internal/sync-defaults` over the
    dispatch namespace (provision seed + on-change re-sync).
  - `createWfpTenantApp` — a tenant-worker `{ fetch }` scaffold: key-ring
    encryption over the tenant's own D1, runtime fallback for inherited
    defaults, the `/internal/sync-defaults` receiver (applies the payload), and
    the control-plane issuer gate. Pure push — the worker never calls the
    control plane at request time; forwarded control-plane tokens verify against
    the **projected** public keys, no runtime JWKS fetch.
- `authhero` and `@authhero/multi-tenancy` are **optional peer dependencies**,
  required only when importing the `/wfp` subpath; the main entry and the light
  adapters (cache, custom-domains, logs, provisioner) are unaffected.
