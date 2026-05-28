---
"@authhero/kysely-adapter": minor
---

Add a `proxy_routes` table and adapter implementation. The standard migration set (`migrateToLatest`) now creates the table, and `createAdapters(db).proxyRoutes` implements the new `ProxyRoutesAdapter` from `@authhero/adapter-interfaces`. A new `createProxyDataAdapter(db)` helper returns a full `ProxyDataAdapter` (CRUD + cross-tenant `resolveHost`) for the `@authhero/proxy` data plane — this replaces the standalone `@authhero/proxy-kysely` package (which has been removed).
