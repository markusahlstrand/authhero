---
"@authhero/kysely-adapter": minor
---

Add a `user_activity` table and clean up `users` column types (issue #1003).

Schema-only, forward-only migration — no data is moved or backfilled yet:

- Converts the large, non-indexed `users` columns `profileData`, `picture`, and `app_metadata` from `varchar` to `TEXT` (so enriched profile data is no longer capped/truncated and InnoDB row-size pressure is relieved). `app_metadata` keeps its `'{}'` default via a MySQL 8 expression default.
- Right-sizes oversized `users` varchars: `created_at`/`updated_at` → `varchar(35)`, `locale` → `varchar(64)`.
- Adds an empty `user_activity` entity (keyed `(tenant_id, user_id)`, FK to `users` with `ON DELETE CASCADE`) to hold the write-often counters (`last_login`, `last_ip`, `login_count`, `failed_logins`, `last_password_reset`).
- Implements the `userActivity` adapter (`get` + merge-`upsert`) and wires it into `createAdapters`.

The login flow now double-writes the login counters to `user_activity` (expand phase). Reads still come from the legacy `users` columns; the read cutover, backfill, and column drops ship in a follow-up PR.
