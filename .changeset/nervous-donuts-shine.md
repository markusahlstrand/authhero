---
"authhero": minor
"@authhero/kysely-adapter": patch
"@authhero/drizzle": patch
---

Add user refresh-token management, matching Auth0's contract.

`GET /api/v2/users/{user_id}/refresh-tokens` lists a user's refresh tokens and
`DELETE /api/v2/users/{user_id}/refresh-tokens` revokes all of them (204). The
list supports Auth0's checkpoint pagination (`from`/`take` returning
`{ tokens, next }`) as well as this codebase's offset style
(`include_totals`/`page`/`per_page`), so both Auth0 SDK clients and the admin UI
work against it. Responses carry only Auth0-equivalent fields: token secrets
(`token_lookup`, `token_hash`) and internal rotation bookkeeping (`family_id`,
`rotated_to`, `rotated_at`) are omitted.

Unlike Auth0, the bulk delete soft-revokes (sets `revoked_at`) rather than
removing rows, so the admin UI and the audit trail still show what was
invalidated and when.

The single-token routes are now also mounted at `/api/v2/refresh-tokens/{id}`,
matching Auth0's hyphenated spelling; the existing `/api/v2/refresh_tokens/{id}`
path stays as an alias.

Adapters gain checkpoint pagination on `refreshTokens.list`, and the drizzle
implementation's `include_totals` count no longer ignores the query filter (it
reported the tenant-wide row count).

The admin UI gains a "Refresh Tokens" tab on the user page with per-token revoke
and a "Revoke all refresh tokens" button.
