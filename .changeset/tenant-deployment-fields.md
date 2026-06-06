---
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
---

Add tenant deployment / provisioning fields (`deployment_type`, `provisioning_state`, `bundle_configuration`, `worker_version`, `worker_script_name`, `storage_kind`, `d1_database_id`, plus `provisioning_error` and `provisioning_state_changed_at`). Existing tenants default to `shared` / `ready` via DB-level defaults; no behavior change. Lays the schema groundwork for provisioning per-tenant Cloudflare Workers from the control-plane API.
