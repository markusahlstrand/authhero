---
"@authhero/drizzle": minor
---

Add a `proxy_routes` table (migration `0004_proxy_routes.sql`) and `ProxyRoutesAdapter` implementation, surfaced as `createAdapters(db).proxyRoutes`. New `createProxyDataAdapter(db)` helper returns a full `ProxyDataAdapter` (CRUD + cross-tenant `resolveHost`) for the `@authhero/proxy` data plane reading from the same Drizzle/D1 database.
