---
"authhero": minor
"@authhero/adapter-interfaces": minor
"@authhero/cloudflare-adapter": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
---

Track WFP tenant code + database versions on the control plane, and add an upgrade path.

The tenant row now records what a Workers-for-Platforms tenant is running so the
control plane can detect drift and drive upgrades:

- New `database_version` field (the latest migration applied — the schema
  version the deployed bundle targets), alongside the existing
  `worker_version` and `bundle_configuration` fields, which are now actually
  populated.
- `createCloudflareWfpD1Provisioner` gains `bundleConfiguration` and
  `workerVersion` options (supplied by the operator at build time) and returns
  all three versions in its `ProvisionResult`. The provisioning hook writes them
  back to the tenant row.
- `createWfpTenantProvisioningHook` gains `onUpgrade(tenantId)`: re-uploads the
  current bundle, reconciles any pending migrations, re-runs the defaults seed,
  and rewrites the recorded versions (marking `provisioning_state` `pending`
  while in flight, `ready`/`failed` on completion).
- New `POST /api/v2/tenants/{id}/redeploy` management endpoint (control-plane
  only), wired via the new `tenantUpgrade` init option, triggers the upgrade and
  returns the refreshed tenant. Returns `501` when no upgrade handler is
  configured.
