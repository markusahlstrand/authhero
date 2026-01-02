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

AuthHero's adapter system is designed to facilitate migration between different storage backends. The standardized interfaces mean that switching adapters typically only requires:

1. Installing the new adapter package
2. Updating configuration
3. Running data migration scripts (when changing storage types)

## Custom Adapters

You can create custom adapters by implementing the interfaces defined in the `@authhero/adapter-interfaces` package. This allows integration with:

- Custom databases
- Legacy systems
- Specialized storage solutions
- Cloud-specific services

See the [Adapter Interfaces documentation](/adapters/interfaces/) for implementation details.
