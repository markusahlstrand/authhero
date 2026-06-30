---
"@authhero/adapter-interfaces": minor
---

Add an optional `userActivity` adapter (issue #1003).

New `UserActivity` type and `UserActivityAdapter` interface (`get` + merge-`upsert`) for the write-often per-user counters (`last_login`, `last_ip`, `login_count`, `failed_logins`, `last_password_reset`) split out of the `users` row. It's optional on `DataAdapters` — adapters that don't implement it (e.g. drizzle) are unaffected, and the login flow only double-writes when it's present.
