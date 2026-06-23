---
"authhero": patch
---

Fix tenant isolation at the token endpoint: a `client_credentials` (and any other prefetch-backed) request scoped to one tenant via the resolved host could authenticate a `client_id` belonging to a different tenant. `prefetchClientBundle` ignored the already-resolved `ctx.var.tenant_id` and did a global `getByClientId` discovery, overwriting the request's tenant with the client's own tenant. It now prefers the request-resolved tenant and only falls back to the global lookup when the request carries no tenant at all.
