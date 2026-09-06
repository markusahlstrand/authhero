---
"@authhero/drizzle": patch
---

Add the missing `(tenant_id, client_id, audience)` unique index on `client_grants`, matching the constraint kysely has always enforced. The migration dedupes existing rows first (keeping the newest per pair), so databases that already accepted duplicates migrate cleanly.
