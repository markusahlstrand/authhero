---
"authhero": minor
"@authhero/adapter-interfaces": minor
"@authhero/aws-adapter": patch
---

Make RFC 7523 client assertions single use and bound their lifetime.

`private_key_jwt` and `client_secret_jwt` assertions were verified but never spent: `jti` was parsed and discarded, and `exp` had no upper bound, so a captured assertion authenticated the client for its full — unbounded — lifetime.

- An assertion is now rejected when `exp - iat` exceeds a maximum (default 300s), and its absolute `exp` is capped at `now + max` so omitting `iat` cannot sidestep the bound. Configurable via `CLIENT_ASSERTION_MAX_LIFETIME_SECONDS`, alongside the new `CLIENT_ASSERTION_LEEWAY_SECONDS`.
- The `jti` is spent at `POST /oauth/token` after signature verification and before the client counts as authenticated; presenting it again returns `invalid_client`. The marker is keyed on a digest of `client_assertion:<client_id>:<jti>`, so two clients may use the same `jti` value while one client cannot reuse its own.

Markers are stored through the existing codes adapter as a new `client_assertion_jti` code type, so they are tenant-scoped, atomic on the `(code_id, code_type)` primary key, and swept by the existing `cleanupCodes` retention job. `login_id` on `codeInsertSchema` is now optional — a client assertion has no login session, and the column was already nullable in every adapter.

Clients that mint assertions with a long `exp` must shorten it, and clients that reuse a fixed `jti` must generate a new one per request.
