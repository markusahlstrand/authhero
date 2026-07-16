---
"@authhero/kysely-adapter": minor
---

Squash the migration set into a production-derived baseline

The 183 historical migrations are replaced by a single baseline generated from
the live production schema, plus two migrations on top of it. The set could not
be replayed from scratch on MySQL anyway — two 2023 migrations both name a
foreign key `user_id_constraint`, which MySQL scopes per-database, so a fresh
replay died at migration 7 of 183.

**This is breaking for existing databases.** `migrateToLatest` will fail with
kysely's corrupted-migrations error against any database that ran the old set,
because its history records 181 migrations that no longer exist. There is no
reconcile path in this release: fresh databases work, existing ones need their
`kysely_migration` history rewritten (181 rows -> 3) before upgrading.

The baseline is a snapshot of production rather than a replay of the migrations,
so a fresh database now matches production instead of matching the old set. Where
they had drifted, production wins: `users` is keyed `(tenant_id, user_id)`, some
columns are narrower (`users.locale` varchar(64), `themes.themeId` varchar(21)),
and the `logs` date/tenant/user indexes are present.

Three things production had lost are restored, since dropping them would have
been a silent regression rather than a snapshot:

- The 17 `tenant_id -> tenants` cascades. Declared inline by the historical set
  and created on SQLite, but silently ignored by Vitess, so production reports
  no trace of them. They live in the baseline because neither engine can add a
  foreign key afterwards — SQLite has no `ALTER TABLE ADD CONSTRAINT`, and on
  PlanetScale foreign-key DDL is precisely what does not work.
- `unique_phone_provider`, declared since the first migration in 2022 and absent
  from production. `POST /api/v2/users` returns 409 on a duplicate phone number
  by catching this constraint's violation; without it the endpoint returned 201
  and created a second user.
- `codes.expires_at_ts` and its index, which landed after the snapshot was
  captured.

`migrateDown` now reverts the baseline as a single step, which drops every table.
Against a populated database that is a wipe, not a rollback.
