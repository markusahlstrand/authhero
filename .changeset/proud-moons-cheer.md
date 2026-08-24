---
"authhero": patch
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
"@authhero/aws": minor
---

Select refresh tokens by user with an exact predicate, not the Lucene grammar

Both SQL adapters split a `q` filter on ` OR ` *before* tokenizing it, so a
user id containing ` OR user_id:<other> OR ` produced a clean middle clause
that matched another user's rows. Quoting the value did not prevent this — the
quotes only bracket the first and last fragments, leaving anything between
them parsed as query syntax. On the bulk-revoke path that meant another user's
tokens could be revoked.

`RefreshTokenListParams` now carries `user_id` as a first-class exact
predicate, and `RefreshTokensAdapter` gains
`revokeByUser(tenant_id, user_id, revoked_at)`. Both compile to equality
comparisons, so a user id is never parsed as a query. `revokeByUser` also skips
rows that already carry a `revoked_at`, so a concurrent bulk revocation cannot
overwrite the first one's audit timestamp — and it replaces an N+1 list-then-
update loop with a single statement.

Regression coverage runs against both the kysely and drizzle implementations.
