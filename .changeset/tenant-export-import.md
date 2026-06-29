---
"authhero": minor
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
"@authhero/aws-adapter": minor
---

Add tenant export/import for migrating a tenant between databases (e.g.
PlanetScale → a per-tenant Workers-for-Platforms D1).

- New `GET /api/v2/tenant-data/export` streams a gzipped JSON-lines export of a
  tenant's durable data (one `{ entity, data }` record per line). Password
  hashes are excluded unless `?include_password_hashes=true` is set, which
  requires the additional `read:user_password_hashes` scope. Signing keys and
  ephemeral/audit tables (sessions, refresh tokens, codes, login sessions, logs)
  are never exported.
- New `POST /api/v2/tenant-data/import` replays an export (gzipped or plain
  JSON-lines) into the current tenant in FK-safe order, returning per-entity
  counts and any non-fatal per-row errors. Importing password hashes requires
  the `create:user_password_hashes` scope. Both operations are written to the
  tenant audit log.
- Every durable entity adapter's `create`/`set`/`assign` now accepts an
  optional `options.importMetadata` argument so an import can faithfully
  preserve the source row's primary id and `created_at`/`updated_at`. These
  values are NOT part of any public insert schema and cannot be set through the
  normal management-API write routes — only the import path passes them.
- Added `themes.list(tenant_id)` to the themes adapter (kysely, drizzle, aws).
