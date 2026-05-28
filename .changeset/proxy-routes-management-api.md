---
"authhero": minor
---

Add a `/api/v2/proxy-routes` management API for CRUD over proxy routes (per tenant) when the data adapter exposes a `proxyRoutes` adapter. Returns 501 if the adapter doesn't implement it. A separate proxy worker can then read from the same database via `createProxyDataAdapter` (from `@authhero/kysely-adapter`, `@authhero/drizzle`, or `@authhero/aws`) or fetch over HTTP with a service token.
