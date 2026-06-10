---
"@authhero/cloudflare-adapter": minor
---

Add Workers-for-Platforms + per-tenant-D1 tenant provisioning, driven straight off the existing `tenants.deployment_type === "wfp"` schema field.

**`createCloudflareWfpD1Provisioner({...})`** — orchestrates the CF API sequence on every tenant lifecycle event:

1. Find-or-create a per-tenant D1 (configurable name template, default `tenant-{tenant_id}`)
2. Apply the supplied `@authhero/drizzle` migrations to it
3. Upload the tenant authhero bundle into the configured dispatch namespace with `AUTH_DB` bound to that D1 and `CONTROL_PLANE_BASE_URL` plain-text-bound to the control plane
4. Set per-tenant secrets via `secrets(tenantId)` resolver — typically `ENCRYPTION_KEY`, `ISSUER`, JWKS material, OAuth client secrets

`onProvision` returns `{ d1DatabaseId, scriptName, d1Name }` so the caller can persist them onto the tenant row. Deprovision is the inverse and tolerates "already gone" on both the script and the D1.

**`createWfpTenantProvisioningHook({ provisioner, tenants })`** — adapts the provisioner to `@authhero/multi-tenancy`'s `databaseIsolation.onProvision` / `onDeprovision` contract:

- Reads the tenant row and gates on `tenant.deployment_type === "wfp"` (override via `shouldProvision`), so the same control plane can host both shared and WFP tenants without code branches.
- Writes `d1_database_id`, `worker_script_name`, `provisioning_state` (`"ready"` / `"failed"`), `provisioning_error`, and `provisioning_state_changed_at` back onto the tenant row — the admin UI surfaces this status directly.

**`CloudflareApiClient` / `CloudflareApiError`** — lower-level wrappers around the CF REST endpoints (D1 CRUD/exec, namespaced script PUT/DELETE, per-script secret PUT). Exported for operators who need to drive individual steps.

The tenant-worker bundle itself is supplied by the caller as a JS string. `tenant-worker.example.ts` documents the canonical shape (drizzle + authhero `init({ controlPlaneSync })`) and the env contract the provisioner wires up.

End-to-end wiring on the control-plane authhero:

```ts
import {
  createCloudflareWfpD1Provisioner,
  createWfpTenantProvisioningHook,
} from "@authhero/cloudflare-adapter";
import { initMultiTenant } from "@authhero/multi-tenancy";
import tenantWorkerScript from "./tenant-worker.dist.js?raw";

const provisioner = createCloudflareWfpD1Provisioner({
  accountId: env.CLOUDFLARE_ACCOUNT_ID,
  apiToken: env.CLOUDFLARE_API_TOKEN,
  dispatchNamespace: "authhero-tenants",
  controlPlaneBaseUrl: env.PUBLIC_BASE_URL,
  tenantWorkerScript,
  migrations: [...],
  secrets: async (tenantId) => ({ /* ENCRYPTION_KEY, ISSUER, ... */ }),
});

const hook = createWfpTenantProvisioningHook({
  provisioner,
  tenants: dataAdapter.tenants,
});

const { app } = initMultiTenant({
  dataAdapter,
  databaseIsolation: {
    getAdapters: async (tenantId) => { /* ... */ },
    onProvision: hook.onProvision,
    onDeprovision: hook.onDeprovision,
  },
});
```

With this wired in, creating a tenant in the admin UI with `deployment_type: "wfp"` triggers the full provisioning sequence — no UI changes needed; the schema, picker, and provisioning state were already in place.
