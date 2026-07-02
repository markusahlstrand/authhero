---
"authhero": minor
"@authhero/kysely-adapter": minor
---

Cut login-activity counters over to the user_activity table (contract phase of #1003)

- `authhero`: `postUserLoginHook` now writes `last_login`/`last_ip`/`login_count` to `data.userActivity` when the adapter provides it (falling back to `users.update` for third-party adapters that don't). This removes the per-login rewrite of the users row and its user-update decorator chain from the login path.
- `@authhero/kysely-adapter`: `users.get`/`users.list` now LEFT JOIN `user_activity` for the activity fields (missing row = never logged in, `login_count` 0); filtering and sorting on those fields via `q`/`sort` still works. `users.create`/`users.update` route any activity fields they receive to `user_activity`. A new migration drops the legacy `last_login`/`last_ip`/`login_count` columns from `users` — run the user_activity backfill script against each environment **before** applying it, since the drop discards any values that were never copied.
