---
"@authhero/cloudflare-adapter": patch
---

WFP provisioner: track applied migrations in a per-tenant D1 table instead of gating on the "freshly created" flag. A provision that died partway through its migrations previously left the D1 partially migrated and a retry skipped migrations entirely; it now reconciles against the tracking table and applies only the missing migrations. Legacy D1s without a tracking table are backfilled and assumed already migrated to preserve heal behavior.
