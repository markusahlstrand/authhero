---
"@authhero/kysely-adapter": patch
"@authhero/drizzle": patch
---

Keep the parent `login_session` alive when a session is created or renewed.
Previously only `refresh_tokens` extended their `login_session`'s expiry, so a
long-lived session could outlive its `login_session` and be orphaned when
cleanup reaped the `login_session`. `sessions.create` and `sessions.update` now
bump the parent `login_session`'s `expires_at` (never shortening), mirroring the
`refresh_tokens` behavior.
