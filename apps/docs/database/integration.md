---
title: Database Integration
description: Integrate AuthHero with various database systems using adapters. Choose from Kysely, Drizzle, or custom adapters for SQL databases.
---

# Database Integration

This guide explains how to integrate AuthHero with various database systems using adapters.

## Overview

AuthHero uses adapters to interact with databases, making it flexible enough to work with various database technologies. This guide covers setting up and configuring database adapters.

The core `authhero` package never imports a database driver. It depends only on the interfaces in [`@authhero/adapter-interfaces`](/customization/adapter-interfaces/), and you inject a concrete implementation at startup. Everything below is about building that object.

## Choosing an Adapter

AuthHero supports several database adapters:

- **Drizzle Adapter**: The primary adapter (Drizzle ORM; SQLite/D1, PostgreSQL, MySQL) — used by all `create-authhero` templates
- **Kysely Adapter**: For SQL databases (PostgreSQL, MySQL, SQLite) — maintained for existing deployments
- **Custom Adapters**: Implementing the adapter interfaces for other database systems

## Setting Up the Drizzle Adapter

Install the package alongside a Drizzle driver for your database:

```bash
npm install @authhero/drizzle drizzle-orm better-sqlite3
```

Build a Drizzle instance with AuthHero's schema, hand it to `createAdapters`, and pass the result to `init()`:

```typescript
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import createAdapters from "@authhero/drizzle";
import * as schema from "@authhero/drizzle/schema/sqlite";
import { init } from "authhero";

const db = drizzle(new Database("db.sqlite"), { schema });
const dataAdapter = createAdapters(db);

const { app } = init({ dataAdapter });
```

On Cloudflare Workers the only difference is the driver and the `useTransactions` flag — D1 has no interactive transactions:

```typescript
import { drizzle } from "drizzle-orm/d1";
import createAdapters from "@authhero/drizzle";
import * as schema from "@authhero/drizzle/schema/sqlite";

const db = drizzle(env.AUTH_DB, { schema });
const dataAdapter = createAdapters(db, { useTransactions: false });
```

`createAdapters` takes a second options argument:

| Option            | Default | Purpose                                                                                                                                                                                                                                                                           |
| ----------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useTransactions` | `true`  | Wrap multi-statement writes in a transaction. Set to `false` on D1.                                                                                                                                                                                                               |
| `controlPlane`    | unset   | Wire the control-plane-only adapters (tenant operations, rollouts) and mount their management routes. Requires the extra `drizzle-control-plane/` migration set; leave unset on ordinary tenant workers. See [Tenant operations](/customization/multi-tenancy/tenant-operations). |

To encrypt credential fields at rest, wrap the adapter before passing it to `init()` — see [Encryption at rest](/security/encryption-at-rest).

## Setting Up the Kysely Adapter

::: tip
Drizzle is the primary adapter. Use Kysely for an existing deployment; for a new one, start with Drizzle.
:::

The package is published as `@authhero/kysely-adapter` (note the suffix — the Drizzle package has none):

```bash
npm install @authhero/kysely-adapter kysely better-sqlite3
```

The adapter does not depend on a driver — install the one for your database (`better-sqlite3` here, `pg` for PostgreSQL, `mysql2` for MySQL).

Build a `Kysely` instance typed with the adapter's `Database` interface, then hand it to `createAdapters`:

```typescript
import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import createAdapters, { type Database } from "@authhero/kysely-adapter";
import { init } from "authhero";

const db = new Kysely<Database>({
  dialect: new SqliteDialect({ database: new SQLite("authhero.db") }),
});

const dataAdapter = createAdapters(db);

const { app } = init({ dataAdapter });
```

Swap the dialect for `PostgresDialect` or `MysqlDialect` (or a PlanetScale dialect) to target another database — the adapter itself is unchanged. `createAdapters` accepts the same `{ useTransactions }` option as the Drizzle one.

## Database Schema

All adapters implement the same logical, multi-tenant schema: almost every table carries a `tenant_id`, and the methods that operate on those tables take the tenant as an explicit first argument. A few entities are deliberately not tenant-scoped — signing keys are keyed by `kid` alone, and `clients.getByClientId` resolves a client id to its tenant — so their methods take no `tenant_id`.

[Schema](/database/schema) documents the tables domain by domain, with entity diagrams. The authoritative definition is the Drizzle schema in [`packages/drizzle/src/schema/sqlite/`](https://github.com/markusahlstrand/authhero/tree/main/packages/drizzle/src/schema/sqlite).

Do not add or alter AuthHero's own tables. The schema is owned by the adapter packages and is upgraded by their shipped migrations; a local change to a managed table will be overwritten or will collide on the next upgrade. Application-specific tables belong in their own namespace, alongside — not inside — the managed ones.

## Migrations

Migrations are never run automatically at boot. Run them yourself before starting the server, and again after every dependency upgrade.

### Drizzle

The migrations are **pre-generated and shipped inside the package**, at `node_modules/@authhero/drizzle/drizzle`. Do not run `drizzle-kit generate` against AuthHero's schema — that produces a divergent migration history that will conflict with the next release.

For a Node/SQLite deployment, apply them with Drizzle's migrator (this is what the scaffolded `npm run migrate` does):

```typescript
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const sqlite = new Database("db.sqlite");
migrate(drizzle(sqlite), {
  migrationsFolder: "node_modules/@authhero/drizzle/drizzle",
});
sqlite.close();
```

For Cloudflare D1, point `migrations_dir` at the same folder in `wrangler.toml` and let Wrangler apply them:

```toml
[[d1_databases]]
binding = "AUTH_DB"
database_name = "authhero-db"
database_id = "your-database-id"
migrations_dir = "node_modules/@authhero/drizzle/drizzle"
```

```bash
wrangler d1 migrations apply AUTH_DB --local    # local
wrangler d1 migrations apply AUTH_DB --remote   # remote
```

`createAdapters(db, { controlPlane: true })` needs a **second** migration set on top of this one — `drizzle-control-plane/`, shipped in the same package with its own journal, which must be applied into its own migrations table (`__drizzle_migrations_control_plane`). Enabling `controlPlane` without applying it leaves the tenant-operation and rollout tables missing. On Node it is simply a second `migrate()` call against the same database — see [Tenant operations](/customization/multi-tenancy/tenant-operations) for the exact snippet. Either way the two sets must stay in separate migrations tables, or each will try to re-apply the other's history.

Ordinary tenant deployments should leave `controlPlane` unset and apply only the core `drizzle/` set.

### Kysely

The Kysely adapter carries its migrations in code and exposes a runner:

```typescript
import { migrateToLatest, migrateDown } from "@authhero/kysely-adapter";

await migrateToLatest(db);
```

`migrateToLatest` is idempotent — it applies only the migrations that have not run yet — so it is safe to call from a deploy step. `migrateDown` reverts the most recent one.

Moving data between two databases (rather than moving the schema forward) is a different job: see [Migration strategies](/database/migration) for the dual-write approach.

## Custom Adapter Implementation

A custom adapter is any object satisfying the `DataAdapters` interface from `@authhero/adapter-interfaces`. It is one property per entity, each holding a small CRUD object:

```typescript
import type { DataAdapters, User } from "@authhero/adapter-interfaces";

const users: DataAdapters["users"] = {
  async get(tenantId, userId): Promise<User | null> {
    /* ... */
  },
  async create(tenantId, user) {
    /* ... */
  },
  async list(tenantId, params) {
    /* ... */
  },
  // rawCreate, update, remove, ...
};
```

Rules worth knowing before you start:

- **Honour the tenant argument.** Wherever a method takes `tenantId` it is not advisory — an implementation that ignores it leaks data across tenants.
- **The required entities really are required.** `DataAdapters` is a complete object: every core entity, plus `transaction`, must be present for `init()` to type-check. Only the properties declared optional in the interface (`rateLimit`, `userActivity`, `analytics`, `outbox`, …) may be left out; those are checked for presence at runtime and their features degrade gracefully. See [Adapter interfaces](/customization/adapter-interfaces/) for which are optional and what the caller does without them.
- **Return `null`, don't throw, for a missing row.** Callers distinguish "not found" from "failed"; throwing turns a 404 into a 500.
- **Match each entity's own list contract.** `ListParams` covers `page` / `per_page` / `include_totals` / `q`, plus `sort`, the keyset-pagination pair `from` / `take`, and the `from_date` / `to_date` range — see [Pagination](/api/pagination). The response envelope is per entity, not shared: `list` on users returns `{ users, ...totals }`, on keys `{ signingKeys, ...totals }`. Take the shape from the entity's typed response interface in [`packages/adapter-interfaces/src/adapters/`](https://github.com/markusahlstrand/authhero/tree/main/packages/adapter-interfaces/src/adapters) rather than assuming one envelope.

The simplest way to build one is to start from an existing implementation: [`packages/drizzle/src/adapters/`](https://github.com/markusahlstrand/authhero/tree/main/packages/drizzle/src/adapters) is the reference, and [`packages/aws`](https://github.com/markusahlstrand/authhero/tree/main/packages/aws) shows the same contract satisfied by a non-SQL store.

You do not have to move every entity to the new backend at once. `createPassthroughAdapter` (from `@authhero/adapter-interfaces`) wraps **one entity adapter** at a time: reads are served by the primary, writes are also synced to one or more secondaries, each of which may be a partial implementation and may be blocking or fire-and-forget. The assembled `DataAdapters` object stays complete — you are swapping one property's implementation, not omitting it. That is what makes an incremental switch between backends possible; see [Migration strategies](/database/migration) and [Built-in adapters](/customization/built-in-adapters).
