---
"@authhero/cloudflare-adapter": minor
"@authhero/multi-tenancy": patch
---

Add the `@authhero/cloudflare-adapter/workflows` subpath (issue #1026 phase 2): durable provision-as-workflow for WFP tenants on Cloudflare Workflows.

- `runProvisionOperation` runs the provisioner steps (via the provider-agnostic `TenantProvisionerSteps` contract) as one durable engine step each — with the defaults seed as a retried step _before_ `ready` and a `verify` step that throws until the tenant D1 actually holds signing keys and its tenant row. "Ready over an empty D1" is no longer possible.
- `createCloudflareWorkflowsExecutor` implements the row-first `TenantOperationExecutor` contract over a structural Workflows binding (no `cloudflare:workers` import in the library; the downstream worker owns the ~10-line `WorkflowEntrypoint` shell — see `entrypoint.example.ts`).
- `reconcileTenantOperations` sweeps operations stuck in `pending`/`running` whose engine instance died before its terminal write, copying terminal engine states into the control-plane log (run from a `scheduled` handler, at least daily).
- `createWfpWorkflowProvisioningHook` replaces inline provisioning with a durable enqueue on tenant create; upgrade/deprovision keep delegating to the inline hook. Wire with `databaseIsolation.recordProvisionOperations: false` (new `@authhero/multi-tenancy` flag) since the workflow owns the operation row.
