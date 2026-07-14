---
"authhero": patch
---

Deduplicate the management-api route modules with shared helpers (#1103): `requireTenantId(ctx)` replaces the repeated tenant-id extraction/400 guard, `withTotals()` replaces the `totalsSchema.extend` wrapper pattern, and `listResponse()` handles the `include_totals` response branching. Response shapes are unchanged; the only behavior change is that handlers which previously passed an unresolved tenant id straight to the adapters now consistently return 400 "tenant-id header is required" when the request resolves no tenant.
