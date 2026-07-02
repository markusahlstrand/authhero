---
"@authhero/drizzle": minor
---

Bring drizzle to parity with the user_activity split (issue #1003): new `user_activity` table (regenerated 0000 baseline) and `userActivity` adapter (`get`/`upsert`), users get/list LEFT JOIN the counters (missing row = never logged in), create/update route `last_login`/`last_ip`/`login_count` to `user_activity`, and the legacy columns are dropped from the `users` schema. Filtering/sorting on activity fields via `q`/`sort` resolves against the joined table.
