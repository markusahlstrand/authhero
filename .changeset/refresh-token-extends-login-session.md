---
"@authhero/kysely-adapter": patch
"@authhero/drizzle": patch
"authhero": patch
---

Fix cleanup deleting `login_sessions` while child `refresh_tokens` are still valid.

`refreshTokens.create` and `refreshTokens.update` now extend the parent
`login_sessions.expires_at_ts` to match the refresh token's longest expiry, in
the same DB transaction. Previously the initial token exchange never bumped
the login_session, so cleanup could delete the parent while its refresh tokens
were still valid.
