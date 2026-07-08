---
"@authhero/kysely-adapter": patch
---

Remove the legacy `login_count` transition shim from the kysely users adapter. Now that the o080 migration (drop of `last_login`/`last_ip`/`login_count` from the `users` table) has run in every environment, `users/create.ts` no longer sniffs driver error strings to retry with a legacy `login_count` value, and `sqlUserSchema` no longer carries the optional `login_count` column.
