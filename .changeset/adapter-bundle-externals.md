---
"@authhero/kysely-adapter": patch
"@authhero/drizzle": patch
"@authhero/aws-adapter": patch
---

Stop bundling private copies of shared dependencies into the adapter dists.

Rollup's `external` array does exact string matching, so subpath imports slipped into the bundles even when the bare package was listed: kysely inlined `hono/http-exception`, parts of `kysely` itself, and the whole `@authhero/proxy` workspace dep; aws inlined `hono/http-exception` and `nanoid`; drizzle had no externals at all and bundled everything (dist shrinks from ~520 kB to ~172 kB). All three configs now use a subpath-aware external function, the same pattern `@authhero/multi-tenancy` and `@authhero/cloudflare` already use.

The user-visible consequence of the old behavior: HTTPExceptions thrown inside an adapter had a different class identity than the host app's `HTTPException`, so `instanceof` checks in error handlers failed and adapter-thrown 4xx errors could surface as 500s. Fresh builds now share the host's hono. (The management API also duck-types these errors since the `GET /logs` keyset PR, so older published adapter versions remain handled.)
