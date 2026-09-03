---
"@authhero/drizzle": patch
"@authhero/kysely-adapter": patch
---

Align the default `clientGrants.list` ordering across adapters: the offset path in drizzle now returns newest first (`created_at desc`), matching kysely, drizzle's own keyset path and Auth0's convention. Both adapters gained a test pinning the default.
