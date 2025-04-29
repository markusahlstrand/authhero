# Drizzle Adapter

The Drizzle adapter allows AuthHero to work with SQL databases using the [Drizzle ORM](https://github.com/drizzle-team/drizzle-orm). It provides an implementation of the adapter interfaces for SQL databases.

**Note**: This adapter is currently not in a working state and is under development.

## Supported Databases

When completed, the Drizzle adapter will support any database that Drizzle supports, including:

- PostgreSQL
- MySQL
- SQLite

## Installation

Install the Drizzle adapter package:

```bash
pnpm add authhero-drizzle-adapter
```

You'll also need to install Drizzle and the appropriate database driver:

```bash
pnpm add drizzle-orm
# And one of the following:
pnpm add postgres # for PostgreSQL
pnpm add mysql2 # for MySQL
pnpm add better-sqlite3 # for SQLite
```

## Usage

```typescript
import { AuthHero } from 'authhero';
import { DrizzleAdapter } from 'authhero-drizzle-adapter';
// Import your Drizzle database setup

// Create the adapter
const adapter = new DrizzleAdapter(db);

// Initialize AuthHero with the adapter
const authHero = new AuthHero({
  adapter,
  // other configuration options
});
```

## Database Schema

[Database schema details will be documented here when the adapter is complete]

## Custom Configuration

[Custom configuration options will be documented here when the adapter is complete]