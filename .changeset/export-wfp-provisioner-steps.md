---
"@authhero/cloudflare-adapter": patch
---

Export `createWfpProvisionerSteps` and its types (`TenantProvisionerSteps`, `TenantProvisionNames`, `WfpProvisionerSteps`) from the package root. They were exported from the internal `wfp-provisioner` module but missing from the public entry point, so consumers wiring the steps into a durable workflow (e.g. Cloudflare Workflows) could not import them.
