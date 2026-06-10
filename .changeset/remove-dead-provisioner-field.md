---
"authhero": major
"@authhero/admin": minor
---

Remove the unused `provisioner` field from `AuthHeroConfig`, along with the unreferenced `NoopTenantProvisioner` class and `TenantProvisioner` / `TenantProvisionerContext` types. The real WFP provisioning path is the `databaseIsolation.onProvision` hook on `createMultiTenancyPlugin` from `@authhero/multi-tenancy`, wired via `createWfpTenantProvisioningHook` from `@authhero/cloudflare-adapter`. The deleted field was declared but never read by anything in this repo.

The admin tenant list now shows `deployment_type` and `provisioning_state` columns so wfp tenants stuck in `pending` / `failed` are visible at a glance, with the `provisioning_error` shown on hover.
