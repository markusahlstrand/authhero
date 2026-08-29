---
"@authhero/cloudflare-adapter": minor
"@authhero/kysely-adapter": patch
"@authhero/drizzle": patch
---

Add `syncCustomDomains`, a cron-driven sweep that reconciles every custom hostname in the Cloudflare zone against the stored custom-domain rows.

Custom-domain state only ever refreshed when a single domain was read by id: `list` and `getByDomain` are deliberately DB-only, so a hostname that finished validation at the edge stayed `pending` in the database until someone opened its detail page. The sweep enumerates Cloudflare-first (one paginated list call per 50 hostnames) and shares its merge/write-back logic with `get`, so the interactive and scheduled refresh paths cannot drift apart.

Also fixes `verification` persistence, which the sweep depends on:

- **drizzle**: `verification` was written to its text column as a raw object, so SQLite rejected the statement ("Too few parameter values were provided") and the accompanying `status` change was lost — a custom domain could never be marked `ready`. It is now stringified on write and parsed on read.
- **kysely**: `getByDomain` returned `verification` as an unparsed JSON string while `get` returned an object. Both now parse it.

The control-plane template now reads `CLOUDFLARE_ZONE_ENTERPRISE`, so a deployment on an Enterprise zone gets the tenant-ownership checks it has always been entitled to. Unset, behaviour is unchanged.
