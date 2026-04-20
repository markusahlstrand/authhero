---
"@authhero/kysely-adapter": patch
---

Store `login_sessions.authParams` as a JSON blob in a new `auth_params` column. The existing hoisted `authParams_*` columns are still populated on create (dual-write) and still read on get when the blob is NULL, so upgrade is backwards compatible and rows created before this release continue to read correctly via the fallback. Adding future AuthParams fields no longer requires a schema migration.

Also widens `login_sessions.authorization_url` from `varchar(1024)` to `text` (MySQL only; SQLite ignores varchar constraints) so real authorize URLs with long scopes / PAR / id_token_hint fit.

`loginSessions.update({ authParams })` now merges the incoming authParams into the stored blob (and the hoisted columns via the existing flatten path), so partial and full-object call patterns both keep the two representations in sync.

Follow-up releases: a data-migration release will backfill `auth_params` for pre-existing rows, and a cleanup release will drop the redundant hoisted `authParams_*` columns and the adapter's fallback branch.
