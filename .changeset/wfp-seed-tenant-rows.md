---
"@authhero/multi-tenancy": patch
"@authhero/cloudflare-adapter": patch
---

Seed the FK-target `tenants` rows into a WFP tenant's database via the defaults
payload, so a freshly provisioned tenant worker can write — not just read
(#972).

A freshly migrated tenant D1 only has the empty `tenants` table the migrations
create. D1 enforces the `tenant_id -> tenants(id)` foreign key, so every
tenant-scoped insert (the tenant's own `POST /api/v2/connections`, and the
projected control-plane defaults keyed under the control-plane tenant id)
FK-failed with a 500 until those rows existed.

- `@authhero/multi-tenancy`: `ControlPlaneDefaultsPayload` now carries a
  `tenants` array of minimal (`id` + `friendly_name`) seed rows, gated by a new
  `tenants` flag on `DefaultsPayloadEntities` (default `true`).
  `buildControlPlaneDefaultsPayload` takes an optional `targetTenantId` and
  emits the control-plane tenant row plus the target tenant's own row;
  `applyControlPlaneDefaultsPayload` upserts those rows **first**
  (create-if-missing, so a re-sync never clobbers a tenant's later edits) and
  reports the outcome under `result.tenants`.
- `@authhero/cloudflare-adapter`: `createDispatchSyncDefaults` passes the target
  tenant id through to the payload build, so a `/internal/sync-defaults` push
  seeds both FK-target rows before applying the defaults.
