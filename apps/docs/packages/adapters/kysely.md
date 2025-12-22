# Kysely Adapter

The Kysely adapter allows AuthHero to work with SQL databases using the [Kysely](https://github.com/kysely-org/kysely) query builder. It provides a single schema definition that works across multiple database dialects.

## Why Kysely?

Kysely was chosen over other ORMs like Drizzle because:

- **Single schema for all databases**: One schema definition works across SQLite, PostgreSQL, and MySQL
- **Type-safe queries**: Full TypeScript support with type inference
- **No 3x schema maintenance**: Unlike Drizzle which requires separate schemas (`pgTable`, `mysqlTable`, `sqliteTable`)

## Supported Databases

The Kysely adapter supports:

- PostgreSQL
- MySQL
- SQLite (including Cloudflare D1)

## Installation

Install the Kysely adapter package:

```bash
pnpm add @authhero/kysely-adapter
```

You'll also need to install Kysely and the appropriate database driver:

```bash
pnpm add kysely

# And one of the following:
pnpm add pg              # for PostgreSQL
pnpm add mysql2          # for MySQL
pnpm add better-sqlite3  # for SQLite
pnpm add kysely-d1       # for Cloudflare D1
```

## Usage

### Basic Setup

```typescript
import { Kysely, SqliteDialect } from "kysely";
import Database from "better-sqlite3";
import { createAdapters, migrateToLatest } from "@authhero/kysely-adapter";

// Create Kysely instance
const db = new Kysely({
  dialect: new SqliteDialect({
    database: new Database("db.sqlite"),
  }),
});

// Run migrations
await migrateToLatest(db);

// Create adapters
const adapters = createAdapters(db);
```

### With Cloudflare D1

```typescript
import { Kysely } from "kysely";
import { D1Dialect } from "kysely-d1";
import { createAdapters } from "@authhero/kysely-adapter";

const db = new Kysely({
  dialect: new D1Dialect({ database: env.AUTH_DB }),
});

const adapters = createAdapters(db);
```

## Database Migrations

### Runtime Migrations (Recommended for Node.js)

For Node.js applications, use the built-in migration function:

```typescript
import { migrateToLatest } from "@authhero/kysely-adapter";

await migrateToLatest(db, true); // true for verbose logging
```

### SQL Export for D1 (Recommended for Cloudflare)

For Cloudflare D1, you can export migrations as raw SQL files:

```bash
# In the kysely package
cd node_modules/@authhero/kysely-adapter
pnpm run export-sql:d1
```

This generates individual migration files in `migrations/` that can be used with:

```bash
wrangler d1 migrations apply AUTH_DB --local
wrangler d1 migrations apply AUTH_DB --remote
```

#### SQL Export Options

- `pnpm run export-sql` - Output combined SQL to stdout
- `pnpm run export-sql:d1` - Generate D1-compatible individual migration files
- `pnpm run export-sql:combined` - Generate a single combined SQL file
- `pnpm run export-sql:squash` - Generate a single squashed migration (for new projects)

The `export-sql:squash` option is useful for new projects as it creates a single `0000_init.sql` file with all tables, rather than 79 separate migration files.

## Database Schema

The adapter creates the following main tables:

- `tenants` - Tenant/organization information
- `users` - User accounts
- `clients` - OAuth/OIDC clients
- `connections` - Social and enterprise connections
- `sessions` - User sessions
- `codes` - Authorization codes
- `refresh_tokens` - Refresh tokens
- `passwords` - Password hashes
- `keys` - Signing keys
- `logs` - Audit logs
- And many more for advanced features

See the [database schema documentation](../../database-schema.md) for complete details.

## Multi-Dialect Support

The same adapter code works across all supported databases:

```typescript
// SQLite
const sqliteDb = new Kysely({
  dialect: new SqliteDialect({
    database: new Database("db.sqlite"),
  }),
});

// PostgreSQL
const pgDb = new Kysely({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: process.env.DATABASE_URL }),
  }),
});

// MySQL
const mysqlDb = new Kysely({
  dialect: new MysqlDialect({
    pool: createPool({
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
    }),
  }),
});

// All use the same adapter creation
const adapters = createAdapters(db);
```