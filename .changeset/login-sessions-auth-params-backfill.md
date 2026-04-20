---
"@authhero/kysely-adapter": patch
"@authhero/drizzle": patch
---

Move `login_sessions.authParams` entirely into the JSON blob column `auth_params` and drop the 18 legacy hoisted `authParams_*` columns.

The backfill migration (`2026-04-20T11:00:00`) reconstructs `auth_params` from the hoisted columns for any row where it is still NULL, guaranteeing the blob is populated before the columns are removed. The follow-up migration (`2026-04-20T12:00:00`) then drops all 18 hoisted columns from `login_sessions` and removes the `login_sessions_client_fk` foreign key that referenced `authParams_client_id`. On MySQL this is a straightforward `DROP FOREIGN KEY` + `DROP COLUMN` sequence; on SQLite the table is recreated because SQLite rejects `DROP COLUMN` on FK-referenced columns.

The adapter now writes and reads authParams exclusively via the JSON blob. DB-level referential integrity between `login_sessions` and `clients` is no longer enforced — the client_id lives inside the blob, which cannot be foreign-keyed. Adding a new field to `AuthParams` no longer requires a schema migration.

The Drizzle/D1 adapter has been updated to match: `src/schema/sqlite/sessions.ts` now declares `auth_params` and drops the hoisted `authParams_*` columns, the login-sessions adapter reads/writes via the blob, and a new `drizzle/0004_login_sessions_auth_params_blob.sql` migration backfills and drops the hoisted columns. The AWS (DynamoDB) adapter already stored authParams as a JSON string, so no change was required there.
