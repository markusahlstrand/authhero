# Kysely Adapter

The Kysely adapter allows AuthHero to work with SQL databases using the [Kysely](https://github.com/kysely-org/kysely) query builder. It provides an implementation of the adapter interfaces for SQL databases.

## Supported Databases

The Kysely adapter supports any database that Kysely supports, including:

- PostgreSQL
- MySQL
- SQLite

## Installation

Install the Kysely adapter package:

```bash
pnpm add authhero-kysely-adapter
```

You'll also need to install Kysely and the appropriate database driver:

```bash
pnpm add kysely
# And one of the following:
pnpm add pg # for PostgreSQL
pnpm add mysql2 # for MySQL
pnpm add better-sqlite3 # for SQLite
```

## Usage

```typescript
import { AuthHero } from 'authhero';
import { KyselyAdapter } from 'authhero-kysely-adapter';
import { Kysely, SqliteDialect } from 'kysely';
import SQLite from 'better-sqlite3';

// Set up the Kysely database connection
const db = new Kysely({
  dialect: new SqliteDialect({
    database: new SQLite('db.sqlite')
  })
});

// Create the adapter
const adapter = new KyselyAdapter(db);

// Initialize AuthHero with the adapter
const authHero = new AuthHero({
  adapter,
  // other configuration options
});
```

## Database Schema

The Kysely adapter requires specific tables in your database. You can use the provided migration tools to set up these tables:

```typescript
import { migrateUp } from 'authhero-kysely-adapter/migrations';

// Run migrations to create the required tables
await migrateUp(db);
```

[Database schema details will be documented here]

## Custom Configuration

[Custom configuration options will be documented here]