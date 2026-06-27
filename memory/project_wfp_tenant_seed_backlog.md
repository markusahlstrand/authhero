---
name: project_wfp_tenant_seed_backlog
description: WFP tenant-row seeding is correct in-repo; prod "ready but empty D1" tenants came from a stale deploy and need a re-sync
metadata:
  type: project
---

The WFP sync-defaults tenant-row projection (`buildControlPlaneDefaultsPayload` → `buildTenantSeeds` → `applyControlPlaneTenantSeeds` in `@authhero/multi-tenancy`, driven by `createDispatchSyncDefaults` in `@authhero/cloudflare-adapter`) is **correct in the current repo**: it seeds both the control-plane `tenants` row and the target tenant's own row into the fresh tenant D1, so tenant-scoped FK writes resolve. Verified by round-trip test in `packages/cloudflare/test/wfp-sync.spec.ts`.

The reported production symptom (tenant D1 has full schema but **0 rows** in `tenants`, `syncDefaults` reported `tenants.upserted === 0`, tenant still marked `ready`) was NOT a current-code bug — it comes from a **stale deployed build** of the control plane / tenant worker (the [[project_wfp_request_routing]] sesamy/auth repo) that predates tenant-row seeding, so the payload arrived with an empty/absent `tenants` field.

**Backlog:** tenants provisioned before the seed-aware versions shipped need a one-off re-sync (re-run `onProvision`/`syncDefaults`) once both control plane and tenant worker run the seed-aware package versions. Until then their tenant-scoped writes FK-fail. Related to [[project_orphaned_login_session_links]]-style data backlogs.

**Why:** the seed only runs at provision time; an old provision left the row missing and a code fix alone doesn't backfill it.
**How to apply:** when triaging WFP tenant 500s on tenant-scoped writes, check the tenant D1's `tenants` table for 0 rows and re-run the seed rather than hunting for a code bug.
