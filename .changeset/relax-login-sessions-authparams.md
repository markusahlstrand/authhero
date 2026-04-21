---
"@authhero/kysely-adapter": patch
---

Split the `login_sessions` authParams column cleanup into two migrations so the blob-only adapter code can be deployed ahead of the heavier column drop.

`2026-04-20T12:00:00_drop_login_sessions_hoisted_authparams` is renamed to `2026-04-20T12:00:00_relax_login_sessions_authparams` and now only drops the `login_sessions_client_fk` foreign key and relaxes `NOT NULL` on `authParams_client_id` — two cheap `ALTER TABLE`s on MySQL. The actual column drop moves to a new `2026-04-21T10:00:00_drop_login_sessions_hoisted_authparams` migration, which can be scheduled independently.

Run order is unchanged on a fresh database. For existing deployments, the split lets you roll out the previous authhero release (which stopped writing hoisted columns) even when the heavier drop hasn't run yet, as long as the relax migration has been applied.
