---
title: Tenant Export & Import
description: Export a tenant's configuration and users as a single JSON-lines file and import it into another AuthHero deployment. Move tenants between environments, seed staging from production, or keep portable backups.
---

# Tenant Export & Import

::: tip What You'll Learn

- How to export everything durable about a tenant — configuration **and** users — into a single file
- How to import that file into another tenant or deployment
- What's included, what's deliberately left out, and how conflicts are handled
- How password hashes are protected behind a dedicated scope
  :::

AuthHero can serialize a tenant's durable data to a single newline-delimited JSON (`.jsonl`) file and load it back into any tenant. Use it to move a tenant between environments (e.g. promote a staging tenant to production), seed a fresh environment from an existing one, or keep a portable, human-readable backup of a tenant's configuration.

::: info Not a database backup
This is a tenant-level, application-aware export — it walks the adapter interfaces, not the raw database. It is **not** a substitute for database-level backups (point-in-time recovery, replication). It captures durable configuration and users; it intentionally drops ephemeral runtime state (see [What's excluded](#whats-excluded)).
:::

## The Endpoints

Both routes live under the management API at `/api/v2/tenant-data`. The tenant is resolved the same way as every other management-API call — via the authenticated token, the `tenant-id` header, a tenant subdomain, or a custom domain (see [Multi-Tenancy](/architecture/multi-tenancy)).

| Method & path | Scope | Purpose |
| --- | --- | --- |
| `GET /api/v2/tenant-data/export` | `read:users` | Stream the tenant's durable data as JSON-lines |
| `POST /api/v2/tenant-data/import` | `create:users` | Load a JSON-lines export into the tenant |

### Export

```bash
# Gzipped JSON-lines (the default) — recommended for real tenants
curl -fL "https://auth.example.com/api/v2/tenant-data/export" \
  -H "Authorization: Bearer $TOKEN" \
  -H "tenant-id: acme" \
  -o acme-export.jsonl.gz
```

**Query parameters:**

| Parameter | Values | Default | Notes |
| --- | --- | --- | --- |
| `gzip` | `true` / `false` | `true` | When `false`, the response is uncompressed `application/x-ndjson` |
| `include_password_hashes` | `true` / `false` | `false` | Requires the additional `read:user_password_hashes` scope |

The response is streamed — the server never buffers the whole tenant dump in memory, so large tenants export without spiking memory. Each line is a single record:

```json
{ "entity": "users", "data": { "user_id": "auth0|123", "email": "a@example.com", "...": "..." } }
{ "entity": "roles", "data": { "id": "rol_1", "name": "admin", "...": "..." } }
```

The download is named `<tenant-id>-export.jsonl.gz` (or `.jsonl` when `gzip=false`).

### Import

```bash
# The endpoint auto-detects gzip vs. plain JSON-lines from the payload
curl -f "https://auth.example.com/api/v2/tenant-data/import" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "tenant-id: acme-staging" \
  --data-binary @acme-export.jsonl.gz
```

**Query parameters:**

| Parameter | Values | Default | Notes |
| --- | --- | --- | --- |
| `include_password_hashes` | `true` / `false` | `false` | Requires the additional `create:user_password_hashes` scope |

The import always targets the tenant resolved from the request — **not** the tenant ID baked into the export. This is what lets you export `acme` and import it into `acme-staging`.

**Response** — per-entity counts plus any non-fatal per-row errors:

```json
{
  "counts": { "users": 1240, "roles": 4, "clients": 3, "connections": 5 },
  "errors": [
    { "entity": "proxy_routes", "error": "proxyRoutes adapter not configured" }
  ]
}
```

A row that fails to import (e.g. an optional adapter isn't configured on the target) is collected as an error and the import continues — one bad row does not abort the whole load.

## What's Included

The export walks the tenant's durable entities in a foreign-key-safe order (parents before children) so an import can replay them without dangling references. This covers, among others:

- **Core configuration** — tenant, clients, connections, resource servers, roles, organizations
- **Users & credentials** — users, authentication methods, and (optionally) password hashes
- **Relationships** — user ↔ role, user ↔ permission, role ↔ permission, organization memberships and connections, client grants
- **Extensibility** — actions and action versions, hooks and hook code, flows, forms
- **Branding & customization** — themes, branding, prompt settings, Universal Login templates, custom text
- **Email & domains** — email providers, email templates, custom domains
- **Infrastructure** — log streams, migration sources, proxy routes (where those adapters are configured)

### What's excluded

The following are deliberately left out:

- **Signing keys** — regenerated on the target. Tokens issued by the source tenant will not validate against the target; consumers must re-fetch JWKS.
- **Ephemeral runtime state** — sessions, refresh tokens, login sessions, one-time codes, grants, logs, action executions, and outbox events.

::: warning Signing keys are not portable
Because signing keys are regenerated, importing a tenant does **not** preserve token-issuing identity. Treat an import as standing up a fresh issuer for that tenant, not as a hot failover.
:::

## How Import Merges

Import is **additive and idempotent on primary keys**:

- A record whose primary ID already exists in the target tenant is **left unchanged** — existing data is never overwritten.
- New records are inserted with their original primary IDs and their `created_at` / `updated_at` timestamps preserved from the source.
- Lines are re-sorted into foreign-key-safe order on import, so parents are always created before the rows that reference them — regardless of the order they appear in the file.

This means re-importing the same file is safe (already-present rows are skipped), and importing into a populated tenant merges rather than clobbers.

## Password Hashes

Password hashes are treated as secrets and gated behind dedicated scopes on **both** ends:

- Export: `include_password_hashes=true` requires `read:user_password_hashes` in addition to `read:users`.
- Import: `include_password_hashes=true` requires `create:user_password_hashes` in addition to `create:users`.

Without these scopes the password-hash records are omitted from the export / skipped on import. A token that requests `include_password_hashes=true` without the corresponding scope receives a `403`. This keeps everyday exports free of credential material unless an operator explicitly opts in with a sufficiently privileged token.

## Safety Limits

The import endpoint guards against oversized uploads and gzip bombs:

- **25 MB** maximum compressed payload (on the wire)
- **250 MB** maximum decoded payload (after inflation)

Exceeding either limit returns `413 Payload Too Large`; inflation is aborted the moment the decoded stream crosses the cap. A body that isn't valid gzipped or plain JSON-lines returns `400`.

## Using the Admin UI

The admin app exposes this under **Settings → Tenant Data**. The page has two sections:

- **Export** — an optional "include password hashes" checkbox, and a button that downloads the gzipped `.jsonl` file.
- **Import** — a file picker (accepts `.jsonl`, `.json`, `.gz`, `.ndjson`), an optional "import password hashes" checkbox, and a results panel showing per-entity counts and the first errors if any rows failed.

The page carries the same caveat inline: sessions, refresh tokens, and logs are not included, and signing keys are regenerated on import.

## Typical Workflows

**Promote staging → production**

1. Export the staging tenant (`include_password_hashes=true` if you're migrating real credentials).
2. Import the file into the production tenant.
3. Point clients at the production issuer — remember tokens must be re-minted, since signing keys differ.

**Seed a new environment**

Export a reference tenant and import it into a freshly created tenant to bootstrap clients, connections, roles, and branding without re-creating them by hand.

**Portable backup**

Schedule a periodic export to object storage. The file is plain JSON-lines, so it's diffable and inspectable — but pair it with real database backups for disaster recovery, since it omits ephemeral state and signing keys.

## Related

- [Multi-Tenancy](/architecture/multi-tenancy) — how a tenant is resolved on each request
- [Management API Security](/security/management-api) — scopes and token model
- [Tenant Lifecycle](/customization/multi-tenancy/tenant-lifecycle) — provisioning and deprovisioning hooks
- [Migration Strategies](/database/migration) — database-level migration between adapters
