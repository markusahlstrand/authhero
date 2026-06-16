---
"create-authhero": minor
---

Add two Workers-for-Platforms templates that complete the WFP control-plane-defaults setup:

- **`cloudflare-wfp-tenant`** — a per-tenant authhero Worker (its own D1) that inherits the control plane's defaults via `withRuntimeFallback`, with keyed encryption (`createEncryptedDataAdapterWithKeyRing`) so the shared `cp`-keyed secrets are held but not readable from a raw database export. Deploys into the `authhero-tenants` dispatch namespace.
- **`cloudflare-control-plane`** — the management surface and rollout source. Runs `initMultiTenant` and exposes `POST /internal/tenants/:id/sync-defaults`, which uses `createDirectRolloutAdapter` to project the control plane's defaults into a tenant's database. Ships with a `buildTenantAdapters` stub to fill in per-tenant D1 resolution.

Together with the existing `cloudflare-wfp-dispatcher` (front door), these scaffold the full three-Worker WFP topology. Both new templates generate a `.dev.vars` with `ENCRYPTION_KEY` and the shared `CONTROL_PLANE_ENCRYPTION_KEY`.
