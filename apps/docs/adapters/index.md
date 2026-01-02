# Adapters Overview

AuthHero uses a modular adapter system to support different databases, storage backends, and cloud platforms. This architecture allows you to choose the right technology stack for your deployment while maintaining a consistent API.

## Available Adapters

### Database Adapters

#### [Kysely (SQL)](/adapters/kysely/)

A type-safe SQL query builder adapter that supports PostgreSQL, MySQL, SQLite, and other SQL databases. Perfect for traditional relational database deployments.

**Features:**

- Type-safe database operations
- Migration support
- Multiple SQL database support
- Comprehensive query building
- Full database schema management

#### [Drizzle (SQL)](/adapters/drizzle/)

A modern TypeScript ORM adapter with excellent type safety and developer experience.

**Features:**

- Excellent TypeScript integration
- Schema migrations
- Relational queries
- Edge runtime support

### NoSQL Adapters

#### [AWS (DynamoDB)](/adapters/aws/)

A DynamoDB adapter using single-table design for AWS-native deployments.

**Features:**

- Single-table design
- Serverless-ready (Lambda, Cloudflare Workers)
- Global distribution with DynamoDB
- Basic authentication flows
- No Lucene query support (basic filtering only)

**Note**: This adapter supports core authentication flows but doesn't support advanced Lucene-style queries. Best for AWS-native deployments with basic filtering needs.

### Platform Adapters

#### [Cloudflare](/adapters/cloudflare/)

Optimized for Cloudflare Workers and edge computing environments.

**Features:**

- D1 database integration
- Workers KV storage
- Edge runtime compatibility
- Global distribution
- Serverless scalability

## Adapter Interfaces

All adapters implement standardized interfaces defined in the [Adapter Interfaces](/adapters/interfaces/) package. This ensures:

- **Consistency**: All adapters provide the same API surface
- **Interoperability**: Easy switching between different storage backends
- **Type Safety**: Full TypeScript support across all adapters
- **Extensibility**: Simple to create custom adapters for specific needs

## Choosing an Adapter

### For Traditional Deployments

- **Kysely**: Best for existing SQL infrastructure, full Lucene query support
- **Drizzle**: Great for new projects with modern TypeScript requirements

### For AWS Deployments

- **AWS**: Native DynamoDB integration, serverless-ready, basic filtering
- **Kysely with RDS**: Full SQL features with AWS infrastructure

### For Edge/Serverless Deployments

- **Cloudflare**: Optimal for global edge deployment with D1
- **AWS**: Works with Lambda and Cloudflare Workers
- **Consider latency**: Choose adapters that minimize database round trips

### For Development

- **SQLite with Kysely**: Easy local development setup
- **DynamoDB Local**: Test AWS adapter locally
- **In-memory options**: Fast testing and development

## Migration Between Adapters

AuthHero's database-agnostic design makes migrating from one storage backend to another straightforward using the **passthrough adapter pattern**. This allows you to:

- **Run multiple adapters simultaneously** during migration
- **Sync all writes to both databases** automatically
- **Read from your existing database** while the new one is being populated
- **Switch over with zero downtime** by changing configuration
- **Migrate across different ORMs and database types**

### How It Works

The `createPassthroughAdapter` utility from `@authhero/adapter-interfaces` enables dual-write mode:

```typescript
import { createPassthroughAdapter } from "@authhero/adapter-interfaces";
import { createKyselyAdapter } from "@authhero/kysely";
import { createDrizzleAdapter } from "@authhero/drizzle";

// Current database (PostgreSQL with Kysely)
const currentAdapter = createKyselyAdapter(postgresDb);

// Target database (MySQL with Drizzle)
const targetAdapter = createDrizzleAdapter(mysqlDb);

// Dual-write configuration
const dataAdapter = {
  users: createPassthroughAdapter({
    primary: currentAdapter.users,      // Reads come from here
    secondaries: [
      {
        adapter: targetAdapter.users,   // Writes go here too
        blocking: true,                 // Wait for success
        onError: (err) => console.error("Migration sync error:", err),
      },
    ],
  }),
  // Configure other entities similarly...
};
```

During migration:
1. **All reads** come from the current database
2. **All writes** go to both databases (current first, then target)
3. After verifying data, **swap the primary** to read from the new database
4. Once stable, **remove the passthrough** and use the new adapter directly

### Migration Steps

1. **Set up both adapters** and configure passthrough mode
2. **Backfill existing data** to the new database
3. **Verify data integrity** between both databases
4. **Switch primary** to read from new database
5. **Monitor for issues** while keeping old database as backup
6. **Remove old database** after confirming stability

### Complete Migration Guide

For a detailed, step-by-step migration guide with code examples, see:

**[Database Migration Guide →](/guides/database-migration)**

This guide covers:
- Setting up dual-write with passthrough adapters
- Backfilling existing data with scripts
- Verification and monitoring strategies
- Switchover procedures and rollback plans
- Troubleshooting common issues

### Use Cases

Beyond database migration, the passthrough adapter pattern supports:

- **Multi-destination logging**: Write logs to both database and analytics
- **Cache synchronization**: Keep multiple cache layers in sync
- **Search index updates**: Sync data to search engines
- **Analytics pipelines**: Send data to warehouses without affecting primary operations

See the [Adapter Concepts](/concepts/adapters#adapter-middleware-and-composition) page for more details on adapter composition.

## Custom Adapters

You can create custom adapters by implementing the interfaces defined in the `@authhero/adapter-interfaces` package. This allows integration with:

- Custom databases
- Legacy systems
- Specialized storage solutions
- Cloud-specific services

See the [Adapter Interfaces documentation](/adapters/interfaces/) for implementation details.
