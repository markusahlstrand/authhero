---
"@authhero/kysely-adapter": patch
"@authhero/drizzle": patch
---

Return 409 instead of 500 when creating a tenant whose ID already exists on PlanetScale (MySQL). The duplicate-key detection in `tenants.create` was matching on the lowercase "duplicate key" substring and a few SQLite codes, neither of which fires for PlanetScale's "Duplicate entry '...' for key 'PRIMARY'" message. Broaden detection to cover the MySQL message text plus `ER_DUP_ENTRY`, the SQLite extended codes (`SQLITE_CONSTRAINT_UNIQUE`, `SQLITE_CONSTRAINT_PRIMARYKEY`), D1's `AlreadyExists`, and the PostgreSQL `23505` SQLSTATE — mirroring what `organizations.create` already does.
