---
"@authhero/adapter-interfaces": minor
"authhero": minor
"@authhero/admin": patch
"@authhero/drizzle": patch
"@authhero/kysely-adapter": patch
"@authhero/cloudflare-adapter": patch
---

Surface the `spm` (Success Password Migration) log type: add a `password-migrations` analytics resource (`GET /api/v2/analytics/password-migrations`) backed by the drizzle, kysely, and Analytics Engine adapters, show it as "Password Migrations" on the admin analytics page, add `spm` to the admin logs type filter, and sort both the logs type filter and the analytics resource dropdown alphabetically.
