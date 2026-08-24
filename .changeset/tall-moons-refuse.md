---
"authhero": minor
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
"@authhero/aws-adapter": minor
---

Store the session and auth-event facts on refresh tokens (#1257, stage 2 of #1255)

Adds five nullable columns to `refresh_tokens`, populated at mint and carried
across rotation:

- `session_id` — the authenticated session the token was issued under, Auth0's
  field of the same name. Deliberately **not** a foreign key and never part of
  a cascade delete: a refresh token is expected to outlive its session, so
  cleanup removes the session row first and this pointer is left to dangle. It
  carries revocation semantics only, which the next stage builds on.
- `organization`, `auth_connection`, `auth_strategy` — auth-event facts
  denormalised from the login session. All are immutable for the life of the
  token, and the refresh grant currently resolves them at exchange time from a
  short-lived `login_sessions` row that is routinely cleaned up, silently
  yielding `undefined` when it is gone.

The refresh grant reads these columns, preferring them over the login session
and skipping that read entirely when `session_id` is present. Rows minted
before this land keep every column null — the same state Auth0 represents with
a null `session_id` — and fall back to the previous login-session lookup, so
their behaviour is unchanged.

**Migrations must run before the new code is deployed:** the code writes columns
that have to exist. Older code against the new schema is fine, so a rolling
deploy is safe in that direction only.

A backfill ships alongside, populating the columns for existing tokens from
their parent `login_sessions` row where it still exists; tokens whose parent
has been cleaned up stay null. All four facts are written together or not at
all — `session_id` is the marker the refresh grant reads to decide whether it
still needs the login session, so setting it alone would make the grant skip a
lookup it still needs.

Also de-duplicates the kysely `refresh_tokens` row mapper, which was copied
across `get`, `getByLookup` and `list`, into a single `toRefreshToken`.
