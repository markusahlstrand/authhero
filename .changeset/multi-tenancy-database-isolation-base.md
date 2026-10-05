---
"authhero": minor
"@authhero/multi-tenancy": minor
---

Fix per-tenant database isolation. The adapters from `databaseIsolation.getAdapters` were replaced by every AuthHero route group with a stack built from the startup `dataAdapter`, so the auth API, universal login, u2, SAML, SCIM and management API read and wrote the shared database instead of the tenant's.

- `authhero`: new optional `ctx.var.baseData` request variable. When an earlier middleware installs a raw adapter there, every route group composes its per-request stack (and drains the outbox and writes logs) on top of it instead of `dataAdapter` / `managementDataAdapter`.
- `@authhero/multi-tenancy`: `createDatabaseMiddleware` sets `ctx.var.baseData` and no longer writes to the runtime's `env` object, which Cloudflare Workers share between requests; it puts `data` on a per-request copy instead. The package's own routes and middleware read the adapter stack from `ctx.var.data`, falling back to `ctx.env.data` when mounted outside AuthHero.

Both packages must be upgraded together for isolation to take effect.
