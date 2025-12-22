# @authhero/kysely-adapter

A Kysely-based adapter for connecting AuthHero to SQLite, PostgreSQL, and MySQL.

## Installation

```bash
npm install @authhero/kysely-adapter
```

## Usage

```typescript
import { Kysely } from "kysely";
import { createAdapters, migrateToLatest } from "@authhero/kysely-adapter";

// Create your Kysely instance with your preferred dialect
const db = new Kysely<Database>({
  dialect: yourDialect,
});

// Run migrations
await migrateToLatest(db);

// Create adapters
const adapters = createAdapters(db);
```

## Exporting SQL for D1

If you're using Cloudflare D1 and prefer to use D1's native migration system instead of running Kysely migrations at runtime, you can export the migrations as raw SQL files:

```bash
# Generate individual D1 migration files
pnpm run export-sql:d1

# Generate combined SQL file
pnpm run export-sql:combined

# Output to stdout
pnpm run export-sql
```

The `export-sql:d1` command generates numbered SQL files in the `migrations/` directory that are compatible with `wrangler d1 migrations apply`.

## Supported Databases

- SQLite (including Cloudflare D1)
- PostgreSQL  
- MySQL
