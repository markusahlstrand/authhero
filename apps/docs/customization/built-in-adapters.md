---
title: Built-in Adapters
description: Overview of AuthHero's built-in database and platform adapters — Kysely, Drizzle, AWS, and Cloudflare.
---

# Built-in Adapters

AuthHero ships with several adapter implementations for different databases and platforms.

## Kysely (SQL) — Recommended

The primary SQL adapter, supporting any database Kysely supports:

- PostgreSQL, MySQL, SQLite, Cloudflare D1, Turso
- Type-safe query builder
- ~39 entity modules covering all AuthHero entities

```typescript
import { createKyselyAdapters } from "@authhero/kysely-adapter";
const adapters = createKyselyAdapters(kyselyInstance);
```

[Kysely adapter details →](/customization/kysely/)

## Drizzle (SQL) — Experimental

An alternative SQL adapter using Drizzle ORM:

- PostgreSQL, MySQL, SQLite
- Schema-first approach
- Not yet production-ready

[Drizzle adapter details →](/customization/drizzle/)

## AWS

Optimized for AWS Lambda deployments:

- DynamoDB for session and code storage
- RDS/Aurora for relational data
- API Gateway integration

[AWS adapter details →](/customization/aws-adapter/)

## Cloudflare

Optimized for Cloudflare Workers:

- D1 for relational data
- KV for caching
- R2 for asset storage
- Durable Objects for rate limiting
- Custom domain support

[Cloudflare adapter details →](/customization/cloudflare-adapter/)
