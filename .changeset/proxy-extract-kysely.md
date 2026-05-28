---
"@authhero/proxy": minor
---

Strip the package down to the data plane. `@authhero/proxy` now ships only the adapter contract (`ProxyDataAdapter`), the HTTP data-plane app (`createProxyApp`, `createProxyDataPlaneRouter`, `createProxyDataPlaneHandler`, host cache), and the in-memory `createStaticProxyAdapter`. It can be initialized with just a JSON config blob and has no peer dependency on `kysely`.

Breaking — removed exports:
- `createKyselyProxyDataAdapter`, `runMigrations`, `migrateDown`, `ProxyDatabase`, `ProxyRoutesTable` — the Kysely backing is now folded into [`@authhero/kysely-adapter`](https://npmjs.com/package/@authhero/kysely-adapter) as `createProxyDataAdapter`, and the `proxy_routes` table is part of its standard migrations.
- `createProxyManagementRouter`, `ProxyManagementOptions` — route CRUD lives in the AuthHero core management API at `/api/v2/proxy-routes`.
