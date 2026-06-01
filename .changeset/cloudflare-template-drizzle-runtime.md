---
"create-authhero": minor
---

Switch the Cloudflare Workers template to `@authhero/drizzle` (with `drizzle-orm/d1`) as the runtime adapter. Drops the `kysely-d1`, `kysely`, and `@authhero/kysely-adapter` runtime dependencies in favor of drizzle's native D1 driver, which avoids the community shim and aligns the runtime adapter with the migration source-of-truth (drizzle migrations were already used). Local and AWS-SST templates are unchanged and continue to use Kysely.

Also bumps the template's `compatibility_date` to `2026-05-01`.
