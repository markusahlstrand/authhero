---
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
"authhero": minor
---

Add tenant deployment / provisioning fields (`deployment_type`, `provisioning_state`, `bundle_configuration`, `worker_version`, `worker_script_name`, `storage_kind`, `d1_database_id`, plus `provisioning_error` and `provisioning_state_changed_at`). Existing tenants default to `shared` / `ready` via DB-level defaults; no behavior change.

Adds a `TenantProvisioner` adapter interface (`packages/authhero/src/provisioning`) and a `NoopTenantProvisioner` implementation, exposed via `AuthHeroConfig.provisioner`. Lays the groundwork for provisioning per-tenant Cloudflare Workers from the control-plane API; the noop is correct for `shared` tenants and stands in until the WFP provisioner is wired in.
