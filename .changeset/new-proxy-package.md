---
"@authhero/proxy": minor
---

Initial release of `@authhero/proxy`: a Hono-based reverse proxy library for fronting custom domains. Shipped as a library (no deploy artifact) — consumers write a thin Worker entry that calls `createProxyApp({ data, management? })`, mirroring how `authhero` is consumed.

Highlights:

- `createProxyApp` factory mounts a data-plane catch-all on `/*` and an optional management API (default `/__proxy/routes`) so both can run in the same Worker, or you can keep them split — e.g. management API mounted inside your AuthHero deploy at `/api/v2/proxy-routes`, with the actual proxy data plane running on a separate domain/Cloudflare account.
- `ProxyDataAdapter` interface with a kysely implementation; per-domain `proxy_routes` joined against the existing `custom_domains` table.
- Built-in middleware: CORS, header rewrite, basic auth, response cache headers.
- Own migration set using a `kysely_migration_proxy` log table so it can share a database with AuthHero without colliding.
