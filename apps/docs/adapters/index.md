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

- **Kysely**: Best for existing SQL infrastructure
- **Drizzle**: Great for new projects with modern TypeScript requirements

### For Edge/Serverless Deployments

- **Cloudflare**: Optimal for global edge deployment
- **Consider latency**: Choose adapters that minimize database round trips

### For Development

- **SQLite with Kysely**: Easy local development setup
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
