---
title: Database Isolation
description: Per-tenant database isolation using DatabaseFactory interface. Support for Cloudflare D1, Turso, or custom database providers.
---

# Database Isolation

Each tenant can have its own database instance for complete data isolation. The multi-tenancy package provides a `DatabaseFactory` interface that can be implemented for different database providers.

## Overview

Database isolation ensures that:

- Each tenant's data is stored in a separate database
- No data can leak between tenants
- Databases can be independently backed up and migrated
- Performance is isolated (one tenant's load doesn't affect others)

## Database Factory Interface

```typescript
interface DatabaseFactory {
  // Get data adapters for a specific tenant
  getAdapters(tenantId: string): Promise<DataAdapters>;

  // Provision a new database for a tenant
  provision(tenantId: string): Promise<void>;

  // Deprovision (delete) a tenant's database
  deprovision(tenantId: string): Promise<void>;
}
```

## Cloudflare D1

For Cloudflare D1 databases, use the factory from `@authhero/cloudflare`:

```typescript
import { setupMultiTenancy } from "@authhero/multi-tenancy";
import { createD1Factory, createD1Adapter } from "@authhero/cloudflare";

const d1Factory = createD1Factory({
  accountId: env.CF_ACCOUNT_ID,
  apiToken: env.CF_API_TOKEN,
  databasePrefix: "tenant_", // Creates databases like "tenant_acme"
  createAdapters: (db) => createD1Adapter(db),
});

const multiTenancy = setupMultiTenancy({
  accessControl: {
    mainTenantId: "main",
  },
  databaseIsolation: {
    getAdapters: d1Factory.getAdapters,
    onProvision: async (tenantId) => {
      await d1Factory.provision(tenantId);
      // Run migrations
      await runMigrations(tenantId);
    },
    onDeprovision: d1Factory.deprovision,
  },
});
```

### How D1 Factory Works

1. **Provisioning**: Creates a new D1 database using the Cloudflare API
2. **getAdapters**: Returns data adapters connected to the tenant's database
3. **Deprovisioning**: Deletes the tenant's D1 database

## Turso / LibSQL

For Turso databases, implement a factory in your application:

```typescript
import { setupMultiTenancy, DatabaseFactory } from "@authhero/multi-tenancy";
import { createClient } from "@libsql/client";

function createTursoFactory(config: {
  organizationName: string;
  apiToken: string;
}) {
  const factory: DatabaseFactory = {
    async getAdapters(tenantId: string) {
      const url = `libsql://tenant-${tenantId}-${config.organizationName}.turso.io`;
      const client = createClient({
        url,
        authToken: config.apiToken,
      });
      return createTursoAdapter(client);
    },

    async provision(tenantId: string) {
      // Call Turso API to create database
      const response = await fetch(
        `https://api.turso.tech/v1/organizations/${config.organizationName}/databases`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: `tenant-${tenantId}`,
            group: "default",
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to create Turso database: ${await response.text()}`,
        );
      }
    },

    async deprovision(tenantId: string) {
      // Call Turso API to delete database
      await fetch(
        `https://api.turso.tech/v1/organizations/${config.organizationName}/databases/tenant-${tenantId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${config.apiToken}`,
          },
        },
      );
    },
  };

  return factory;
}

// Usage
const tursoFactory = createTursoFactory({
  organizationName: "my-org",
  apiToken: env.TURSO_API_TOKEN,
});

const multiTenancy = setupMultiTenancy({
  databaseIsolation: {
    getAdapters: tursoFactory.getAdapters,
    onProvision: tursoFactory.provision,
    onDeprovision: tursoFactory.deprovision,
  },
});
```

## Custom Database Provider

Implement your own factory for any database:

```typescript
import { DatabaseFactory, setupMultiTenancy } from "@authhero/multi-tenancy";

const customFactory: DatabaseFactory = {
  async getAdapters(tenantId: string) {
    // Connect to the tenant's database
    const connection = await connectToDatabase({
      host: `tenant-${tenantId}.db.example.com`,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
    });

    // Return data adapters
    return createMyAdapter(connection);
  },

  async provision(tenantId: string) {
    // 1. Create database
    await createDatabase(`tenant_${tenantId}`);

    // 2. Run migrations
    await runMigrations(tenantId);

    // 3. Seed default data
    await seedDefaultData(tenantId);

    // 4. Configure backups
    await configureBackups(tenantId);
  },

  async deprovision(tenantId: string) {
    // 1. Create final backup
    await backupDatabase(tenantId);

    // 2. Archive data
    await archiveData(tenantId);

    // 3. Delete database
    await deleteDatabase(`tenant_${tenantId}`);
  },
};

const multiTenancy = setupMultiTenancy({
  databaseIsolation: {
    getAdapters: customFactory.getAdapters,
    onProvision: customFactory.provision,
    onDeprovision: customFactory.deprovision,
  },
});
```

## Configuration Options

### Basic Setup

Minimal configuration for database isolation:

```typescript
const multiTenancy = setupMultiTenancy({
  databaseIsolation: {
    getAdapters: async (tenantId) => {
      const db = await getTenantDatabase(tenantId);
      return createAdapter(db);
    },
  },
});
```

### With Provisioning

Add provisioning for automatic database creation:

```typescript
const multiTenancy = setupMultiTenancy({
  databaseIsolation: {
    getAdapters: factory.getAdapters,

    onProvision: async (tenantId) => {
      // Create database
      await factory.provision(tenantId);

      // Run migrations
      await runMigrations(tenantId);

      // Seed data
      await seedData(tenantId);
    },
  },
});
```

### With Deprovisioning

Add cleanup when tenants are deleted:

```typescript
const multiTenancy = setupMultiTenancy({
  databaseIsolation: {
    getAdapters: factory.getAdapters,
    onProvision: factory.provision,

    onDeprovision: async (tenantId) => {
      // Backup before deletion
      await backupDatabase(tenantId);

      // Delete database
      await factory.deprovision(tenantId);

      // Clean up related resources
      await cleanupResources(tenantId);
    },
  },
});
```

## Middleware Integration

The database middleware automatically resolves and injects the correct database adapters:

```typescript
import { createDatabaseMiddleware } from "@authhero/multi-tenancy";

const dbMiddleware = createDatabaseMiddleware({
  databaseIsolation: {
    getAdapters: factory.getAdapters,
  },
});

app.use("*", dbMiddleware);
```

The middleware:

1. Extracts the tenant ID from the request context
2. Calls `getAdapters(tenantId)` to get the tenant's database
3. Injects the adapters into `c.env.data`
4. All downstream handlers use the tenant-specific database

## Best Practices

### 1. Connection Pooling

Implement connection pooling to avoid creating new connections on every request:

```typescript
const connectionPool = new Map<string, DataAdapters>();

const factory: DatabaseFactory = {
  async getAdapters(tenantId: string) {
    // Check cache first
    if (connectionPool.has(tenantId)) {
      return connectionPool.get(tenantId)!;
    }

    // Create and cache connection
    const adapters = await createConnection(tenantId);
    connectionPool.set(tenantId, adapters);
    return adapters;
  },
  // ...
};
```

### 2. Migration Management

Track migration status per tenant:

```typescript
async function runMigrations(tenantId: string) {
  const db = await getTenantDatabase(tenantId);

  // Check current migration version
  const currentVersion = await db.getMigrationVersion();

  // Run pending migrations
  const migrations = await getPendingMigrations(currentVersion);
  for (const migration of migrations) {
    await db.runMigration(migration);
  }
}
```

### 3. Backup Strategy

Implement regular backups:

```typescript
async function provision(tenantId: string) {
  await createDatabase(tenantId);

  // Schedule daily backups
  await scheduleBackup(tenantId, {
    frequency: "daily",
    retention: 30,
  });
}
```

### 4. Error Handling

Handle database errors gracefully:

```typescript
const factory: DatabaseFactory = {
  async getAdapters(tenantId: string) {
    try {
      return await connectToDatabase(tenantId);
    } catch (error) {
      console.error(
        `Failed to connect to database for tenant ${tenantId}:`,
        error,
      );

      // Fall back to read-only replica
      return await connectToReadReplica(tenantId);
    }
  },
  // ...
};
```

## Performance Considerations

### Lazy Loading

Databases are only connected when needed:

```typescript
// Database connection happens on first request
app.get("/api/users", async (c) => {
  // c.env.data is populated by middleware
  const users = await c.env.data.users.list();
  return c.json(users);
});
```

### Caching

Cache database connections to avoid repeated setup:

```typescript
const cache = new LRUCache<string, DataAdapters>({
  max: 100,
  ttl: 1000 * 60 * 60, // 1 hour
});

const factory: DatabaseFactory = {
  async getAdapters(tenantId: string) {
    const cached = cache.get(tenantId);
    if (cached) return cached;

    const adapters = await createConnection(tenantId);
    cache.set(tenantId, adapters);
    return adapters;
  },
  // ...
};
```

### Read Replicas

Use read replicas for better performance:

```typescript
const factory: DatabaseFactory = {
  async getAdapters(tenantId: string) {
    return {
      // Write operations go to primary
      ...(await connectToPrimary(tenantId)),

      // Read operations go to replica
      users: await connectToReplica(tenantId, "users"),
      logs: await connectToReplica(tenantId, "logs"),
    };
  },
  // ...
};
```

## Next Steps

- [Tenant Lifecycle](./tenant-lifecycle.md) - Learn about tenant creation and deletion
- [Settings Inheritance](./settings-inheritance.md) - Inherit configuration from main tenant
- [API Reference](./api-reference.md) - Complete API documentation
