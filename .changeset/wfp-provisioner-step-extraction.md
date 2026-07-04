---
"@authhero/cloudflare-adapter": patch
---

Extract the WFP provisioner's steps into a reusable `createWfpProvisionerSteps` factory behind a provider-agnostic `TenantProvisionerSteps` contract (`findOrCreateDatabase`, `applyMigrations` with tracking-table reconcile, `uploadScript`, `uploadSecrets`, `deprovision` — no D1/Cloudflare terminology in the interface, so future providers such as Bunny SQLite can implement the same seam), and move `collectSyncDefaultsErrors` into a shared module. No behavior change — `createCloudflareWfpD1Provisioner` is now a thin sequence over the steps object, so the durable workflow executor (issue #1026 phase 2) can run the same units with per-step retries.
