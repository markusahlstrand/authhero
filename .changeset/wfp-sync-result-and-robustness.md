---
"@authhero/cloudflare-adapter": minor
---

Harden the Workers-for-Platforms control-plane sync surface so host apps can drop their hand-rolled transport and receiver:

- `createDispatchSyncDefaults` now resolves with the tenant worker's `ControlPlaneDefaultsApplyResult` (previously `void`), so callers can warn on `received === 0`, surface per-entity errors, and assert which signing keys projected.
- `createWfpTenantApp` gains three options: a **gated** `additionalIssuers` (the default now only accepts `CONTROL_PLANE_ISSUER` for control-plane-minted tokens, not tenant tokens), `continueOnError` (defaults `true` so one bad inherited row no longer aborts the whole projection), and an `onSyncResult` hook for logging what landed without re-implementing the route.
- The `/internal/sync-defaults` receiver now always logs the cause and returns a structured `{ error, detail }` body plus an `X-Authhero-Error` header instead of an opaque `Internal Server Error`; the dispatch push surfaces that error code. Dispatch-namespace workers can't be `wrangler tail`'d, so this is the only place the failure cause is visible.
- `createWfpTenantProvisioningHook` accepts an optional `syncDefaults` seed run after the CF resources exist but before the tenant is marked `ready`. If the seed fails the tenant is marked `failed` (resource ids still persisted) and the error re-thrown — closing the "ready over an empty D1" gap.
- The provisioner now skips migrations when reusing an existing D1 (so a re-provision heals an orphaned worker instead of throwing on duplicate columns), and `onDeprovision` guarantees both the script and D1 teardown are attempted, aggregating errors instead of short-circuiting.
