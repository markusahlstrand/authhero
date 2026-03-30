---
title: Adapters
description: How AuthHero's adapter pattern enables database-agnostic operation, adapter layering, and easy migration between databases.
---

# Adapters

AuthHero uses a pluggable adapter pattern to decouple authentication logic from data storage. The core `authhero` package never touches a database directly — it works through adapter interfaces.

## The Adapter Pattern

The `DataAdapters` interface defines CRUD operations for every entity in the system:

```typescript
interface DataAdapters {
  users: UsersAdapter;
  clients: ClientsAdapter;
  connections: ConnectionsAdapter;
  sessions: SessionsAdapter;
  codes: CodesAdapter;
  tickets: TicketsAdapter;
  keys: KeysAdapter;
  // ... ~39 entity modules in total
}
```

You inject a concrete adapter when initializing AuthHero:

```typescript
import { createApp } from "authhero";
import { createKyselyAdapters } from "@authhero/kysely-adapter";

const adapters = createKyselyAdapters(db);
const app = createApp({ dataAdapter: adapters });
```

## Built-in Adapters

| Adapter | Database | Best For |
| --- | --- | --- |
| `@authhero/kysely-adapter` | PostgreSQL, MySQL, SQLite, D1, Turso | Most deployments |
| `@authhero/drizzle-adapter` | PostgreSQL, MySQL, SQLite | Drizzle users (experimental) |
| `@authhero/aws` | DynamoDB + RDS | AWS Lambda deployments |
| `@authhero/cloudflare` | D1 + KV + R2 | Cloudflare Workers deployments |

## Layering Adapters

One of the most powerful features is the ability to layer adapters. The `createPassthroughAdapter()` utility lets you compose adapters that sync writes to multiple backends simultaneously.

This enables:

### Database Migration

Write to both the old and new database during migration, then switch reads:

```typescript
const adapters = createPassthroughAdapter(
  primaryAdapter,   // reads come from here
  secondaryAdapter  // writes are synced here too
);
```

### Fallback

Read from the primary adapter, fall back to a secondary if data isn't found:

```typescript
const adapters = createFallbackAdapter(
  primaryAdapter,
  legacyAdapter
);
```

### Caching

Layer a cache adapter in front of a database adapter for frequently accessed data like tenant settings and signing keys.

## Writing Custom Adapters

Implement the `DataAdapters` interface (from `@authhero/adapter-interfaces`) to support any database or storage backend. Each adapter module handles one entity type with standard CRUD operations.

See [Customization — Adapter Interfaces](/customization/adapter-interfaces/) for implementation details.
