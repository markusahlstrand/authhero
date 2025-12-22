# @authhero/drizzle

Drizzle ORM schemas for AuthHero - used for **migration generation only**.

## Purpose

This package provides Drizzle ORM schema definitions for generating database migrations. AuthHero uses:

- **Kysely** for runtime queries (single schema works across SQLite/MySQL/PostgreSQL)
- **Drizzle** for migration generation (native D1/SQLite support with proper diff migrations)

## Available Schemas

### SQLite/D1

```typescript
import * as schema from "@authhero/drizzle/sqlite";
```

Designed for Cloudflare D1 and SQLite databases.

## Generating Migrations

```bash
# Generate a new migration
pnpm db:generate

# Push changes directly (development only)
pnpm db:push
```

Migrations are output to `./drizzle/sqlite/`.

## Why This Approach?

| Tool | Role | Why |
|------|------|-----|
| **Kysely** | Runtime queries | Single schema works across all dialects |
| **Drizzle** | Migration generation | Native D1 support, automatic diff migrations |

Drizzle requires separate schema definitions per dialect, so we maintain a SQLite schema here specifically for D1 migration generation. The Kysely adapter handles runtime database operations.

## Usage with create-authhero

The `cloudflare-simple` template uses pre-generated migrations from this schema. Users can:

1. Use the initial migration as-is for a fresh database
2. Modify the Drizzle schema and run `pnpm db:generate` for incremental changes

## Schema Files

```
src/schema/sqlite/
├── index.ts          # Main export
├── tenants.ts        # Tenant tables
├── users.ts          # User & password tables  
├── clients.ts        # Client & grant tables
├── connections.ts    # Connection & domain tables
├── sessions.ts       # Session, token & code tables
├── organizations.ts  # Organization tables
├── roles.ts          # Role & permission tables
├── branding.ts       # Branding, theme & UI tables
├── logs.ts           # Log tables
└── legacy.ts         # Legacy/deprecated tables
```
