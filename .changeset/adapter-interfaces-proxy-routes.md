---
"@authhero/adapter-interfaces": minor
---

Add `ProxyRoutesAdapter` interface and the `ProxyRoute` / `MiddlewareConfig` zod schemas. The contract lives here so every database adapter (`@authhero/kysely-adapter`, `@authhero/drizzle`, `@authhero/aws-adapter`) can implement it as part of `DataAdapters.proxyRoutes`, and `authhero` can ship the management API natively.
