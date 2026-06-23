---
"authhero": patch
---

Return 404 for ISSUER-apex subdomains that don't map to a real tenant. `tenantMiddleware` previously trusted the subdomain label (`{tenant_id}.{issuerHost}`) as the tenant id without verifying it existed, deferring validation to the first tenant-scoped read. That assumption didn't hold for every endpoint — e.g. the token endpoint would mint a token carrying `iss=https://does-not-exist.{issuerHost}/` for a tenant that doesn't exist. The middleware now does a single indexed `tenants.get(label)` and throws 404 "Tenant not found" when the subdomain has no matching tenant.
