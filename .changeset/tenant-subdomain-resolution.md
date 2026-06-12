---
"authhero": minor
---

Rework host-based tenant resolution in `tenantMiddleware` for the tenant-subdomain deployment model:

- **Tenant subdomain fast path**: hosts of the form `{tenant_id}.{issuerHost}` resolve with **zero DB calls** — the subdomain label is trusted as the tenant id and validation is deferred to the first tenant-scoped read (the client-bundle prefetch 404s unknown tenants; `setTenantId` still throws on mismatch with state-derived tenants). Previously this path paid an uncached `tenants.get(subdomain)` round-trip on every request.
- **Scoped trust**: the subdomain interpretation only applies to hosts under the ISSUER apex. The first label of an arbitrary (non-issuer) host is no longer probed as a tenant id — those hosts resolve exclusively via the verified `customDomains.getByDomain` lookup. The ISSUER apex itself no longer probes its own first label as a tenant.
- **State-keyed routes skip the auto-detect fallback**: `/callback`, `/login/callback`, and `/authorize/resume` resolve their tenant from the state artifact (oauth2_state code → login session → client), so the single-tenant `tenants.list` fallback — an uncached query on every request — is skipped for them.

`connectionCallback` now also passes the already-resolved `ctx.var.tenant_id` to `prefetchClientBundle`, skipping the redundant `clients.getByClientId` discovery when the request arrived on a tenant subdomain.
