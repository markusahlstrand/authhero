---
"@authhero/multi-tenancy": minor
"authhero": minor
"@authhero/cloudflare-adapter": patch
---

Record tenant lifecycle operations and expose them via the management API (issue #1026, phase 1).

- `@authhero/multi-tenancy` gains an operations module: `runRecordedTenantOperation` wraps `databaseIsolation.onProvision` so every provision writes a `tenant_operations` row with step events (no behavior change — recording is skipped when the adapters are absent and is warn-only on write failure), plus `createInlineExecutor` / `enqueueTenantOperation` implementing the row-first executor contract the Cloudflare Workflows engine plugs into next. `initMultiTenant` wires a default inline executor for `upgrade` operations when `tenantUpgrade` is configured.
- `authhero` mounts `GET /api/v2/operations/{id}`, `GET/POST /api/v2/tenants/{id}/operations` (new scopes `read:tenant_operations`, `create:tenant_operations`) when the control-plane operations adapters are present, with a new `tenantOperationExecutor` config binding.
- `@authhero/cloudflare-adapter`'s WFP provisioning hook accepts an optional step reporter and surfaces `provision-resources` / `seed-defaults` boundaries; reporting can never fail a provision.
