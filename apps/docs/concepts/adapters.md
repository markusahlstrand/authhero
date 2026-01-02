# Adapters

Adapters are the data access layer in AuthHero that abstract database operations and platform-specific functionality. They provide a consistent interface for storing and retrieving authentication data across different storage backends.

## Why Adapters?

AuthHero is designed to run on various platforms and databases:

- **Traditional servers** with PostgreSQL, MySQL, or SQLite
- **Serverless environments** with managed databases
- **Edge computing** on Cloudflare Workers with D1
- **Custom deployments** with specialized storage needs

Adapters make this possible by implementing a standard interface while handling platform-specific details internally.

## Adapter Types

### Database Adapters

Database adapters handle CRUD operations for authentication data:

- **[Kysely](/adapters/kysely/)** - SQL databases via type-safe query builder (full Lucene query support)
- **[Drizzle](/adapters/drizzle/)** - SQL databases via modern ORM
- **[AWS](/adapters/aws/)** - DynamoDB with single-table design (basic filtering, no Lucene queries)

### Platform Adapters

Platform adapters add cloud-specific capabilities:

- **[Cloudflare](/adapters/cloudflare/)** - D1 database, KV storage, custom domains, analytics

## Adapter Middleware and Composition

AuthHero's adapter architecture supports **middleware patterns** that allow you to combine multiple adapters or add cross-cutting concerns like caching, logging, or data synchronization.

### Passthrough Adapter

The `createPassthroughAdapter` utility enables syncing write operations to multiple adapter implementations simultaneously. This powerful pattern supports:

- **Database Migration**: Gradually migrate from one database to another
- **Multi-destination Logging**: Write logs to both database and analytics services
- **Cache Warming**: Keep multiple cache layers synchronized
- **Search Index Sync**: Update search indexes alongside primary storage

#### How It Works

A passthrough adapter has one **primary** adapter and one or more **secondary** adapters:

- **Reads** always come from the primary adapter
- **Writes** go to the primary adapter first, then are synced to all secondaries
- Secondaries can be **blocking** (wait for completion) or **non-blocking** (fire-and-forget)
- Secondary failures are logged but don't block the primary operation

```typescript
import { createPassthroughAdapter } from "@authhero/adapter-interfaces";
import { createKyselyAdapter } from "@authhero/kysely";
import { createDrizzleAdapter } from "@authhero/drizzle";

// Primary: PostgreSQL with Kysely
const postgresAdapter = createKyselyAdapter(postgresDb);

// Secondary: MySQL with Drizzle (migration target)
const mysqlAdapter = createDrizzleAdapter(mysqlDb);

// Create combined adapter
const combinedAdapter = {
  ...postgresAdapter,
  users: createPassthroughAdapter({
    primary: postgresAdapter.users,
    secondaries: [
      {
        adapter: mysqlAdapter.users,
        blocking: true, // Wait for MySQL write to complete
        onError: (error, method, args) => {
          console.error(`MySQL sync failed for ${method}:`, error);
          // Alert your monitoring system
        },
      },
    ],
  }),
  // Repeat for other entities...
};
```

### Multi-Adapter Use Cases

#### 1. Database Migration

Run two databases in parallel during migration:

```typescript
const dataAdapter = {
  users: createPassthroughAdapter({
    primary: oldDatabaseAdapter.users, // Read from old DB
    secondaries: [
      {
        adapter: newDatabaseAdapter.users, // Write to new DB
        blocking: true, // Ensure writes succeed before returning
      },
    ],
  }),
};

// All reads come from the old database
// All writes go to both databases
// When migration is complete, swap the primary
```

Once data is fully synced, you can:
1. Switch the primary and secondary to read from the new database
2. Verify data integrity
3. Remove the passthrough and use the new adapter directly

#### 2. Analytics and Monitoring

Send data to analytics without affecting primary operations:

```typescript
const logsAdapter = createPassthroughAdapter({
  primary: databaseLogsAdapter,
  secondaries: [
    {
      adapter: analyticsEngineAdapter,
      blocking: false, // Don't wait for analytics
    },
    {
      adapter: webhookNotifier,
      blocking: false,
    },
  ],
});
```

#### 3. Cache Synchronization

Keep multiple cache layers in sync:

```typescript
const cacheAdapter = createPassthroughAdapter({
  primary: redisCacheAdapter,
  secondaries: [
    { adapter: memcachedAdapter },
    { adapter: cdnCacheAdapter },
  ],
  syncMethods: ["set", "delete"], // Only sync write operations
});
```

#### 4. Multi-Cloud Resilience

Ensure high availability by running on multiple cloud providers simultaneously. If one provider experiences an outage, you can quickly failover to the other:

```typescript
import { createCloudflareAdapter } from "@authhero/cloudflare";
import { createKyselyAdapter } from "@authhero/kysely";

// Primary: Cloudflare D1 (edge database)
const cloudflareAdapter = createCloudflareAdapter(cloudflareEnv);

// Secondary: AWS RDS with Kysely (regional database)
const awsAdapter = createKyselyAdapter(awsDb);

const dataAdapter = {
  users: createPassthroughAdapter({
    primary: cloudflareAdapter.users,
    secondaries: [
      {
        adapter: awsAdapter.users,
        blocking: true, // Ensure AWS stays in sync
        onError: (error) => {
          // Alert on sync failures - may indicate AWS issues
          alertOpsTeam("AWS sync failed", error);
        },
      },
    ],
  }),
  // Configure other entities similarly...
};

// If Cloudflare has an outage, quickly switch to AWS:
// Just swap primary and secondary in your configuration
```

**Benefits:**
- **Zero data loss**: All writes go to both providers
- **Fast failover**: Switch configuration to make AWS primary
- **Provider independence**: Not locked into a single cloud
- **Regional coverage**: Combine edge (Cloudflare) with regional (AWS) deployment

**Considerations:**
- **Increased costs**: Running two databases
- **Latency**: Blocking writes may be slower (use non-blocking if acceptable)
- **Consistency**: Monitor sync health to ensure both databases stay aligned
- **Failover testing**: Regularly test switching between providers

### Configuration Options

```typescript
interface PassthroughConfig<T> {
  // Primary adapter - handles all reads and initial writes
  primary: T;

  // Secondary adapters to sync writes to
  secondaries: Array<{
    // Can be a partial implementation - only implemented methods are called
    adapter: Partial<T>;

    // Wait for this secondary before returning? Default: false
    blocking?: boolean;

    // Error handler for failed secondary writes
    onError?: (error: Error, method: string, args: unknown[]) => void;
  }>;

  // Which methods trigger secondary syncing
  // Default: ["create", "update", "remove", "delete", "set"]
  syncMethods?: string[];
}
```

### Best Practices

1. **Use blocking for critical secondaries**: If data consistency matters (like during migration), set `blocking: true`
2. **Monitor secondary failures**: Always implement `onError` handlers to track sync issues
3. **Partial implementations**: Secondaries don't need to implement all methods - only implement what you need
4. **Gradual rollout**: Migrate one entity at a time (start with logs, then users, etc.)
5. **Verify before switching**: Monitor secondary writes for errors before promoting to primary

See the [Database Migration Guide](/guides/database-migration) for a complete step-by-step migration example.

## Writing a Custom Adapter

### 1. Implement the Core Interfaces

All adapters must implement the interfaces defined in `@authhero/adapter-interfaces`:

```typescript
import {
  Users,
  Tenants,
  Applications,
  Connections,
  // ... other interfaces
} from "@authhero/adapter-interfaces";

export interface MyDatabaseAdapter {
  users: Users;
  tenants: Tenants;
  applications: Applications;
  connections: Connections;
  // ... other required entities
}
```

The complete list of required interfaces can be found in the [Adapter Interfaces](/adapters/interfaces/) documentation.

### 2. Handle Database-Specific Errors

Adapters should catch database-specific errors and convert them to standard HTTP exceptions. This ensures consistent error handling across the application:

```typescript
import { HTTPException } from "hono/http-exception";

export function create(db: MyDatabase) {
  return async (tenantId: string, user: User): Promise<User> => {
    try {
      await db.insert("users", user);
    } catch (error: any) {
      // Convert database unique constraint errors to 409 Conflict
      if (
        error?.code === "UNIQUE_VIOLATION" ||
        error?.message?.includes("duplicate key")
      ) {
        throw new HTTPException(409, {
          message: "User already exists",
        });
      }
      
      // Convert other known errors
      if (error?.code === "FOREIGN_KEY_VIOLATION") {
        throw new HTTPException(400, {
          message: "Invalid reference to related entity",
        });
      }
      
      // Re-throw unknown errors
      throw error;
    }

    return user;
  };
}
```

**Why use HTTPException?**

HTTPException from Hono flows through the entire request pipeline automatically. When an adapter throws an HTTPException:

1. Hono's error handler catches it
2. The HTTP status code and message are sent to the client
3. No route-level error handling is needed

This pattern is used throughout AuthHero's adapters (see [users/create.ts](https://github.com/markusahlstrand/authhero/blob/main/packages/kysely/src/users/create.ts), [tenants/create.ts](https://github.com/markusahlstrand/authhero/blob/main/packages/kysely/src/tenants/create.ts), etc.).

### 3. Implement Query Filtering

Many list operations support Lucene-style query syntax for filtering.

**Note**: Not all adapters support Lucene queries. For example, the [AWS adapter](/adapters/aws/) uses DynamoDB which only supports basic filtering. If advanced queries aren't needed for your use case, you can implement simpler filtering logic:

```typescript
import { luceneFilter } from "./helpers/filter";

export function list(db: MyDatabase) {
  return async (params: { q?: string; page?: number; per_page?: number }) => {
    let query = db.selectFrom("users");
    
    // Apply Lucene-style filtering if query provided
    if (params.q) {
      query = luceneFilter(db, query, params.q, ["email", "name"]);
    }
    
    // Apply pagination
    const page = params.page ?? 0;
    const perPage = params.per_page ?? 50;
    query = query.limit(perPage).offset(page * perPage);
    
    const users = await query.execute();
    return { users };
  };
}
```

The `luceneFilter` helper supports:
- Field-specific searches: `email:user@example.com`
- AND queries: `email:user@example.com name:John`
- OR queries: `email:user1@example.com OR email:user2@example.com`
- Comparison operators: `login_count:>5`
- Negation: `-name:John`
- Quoted values: `name:"John Doe"`

See [kysely/src/helpers/filter.ts](https://github.com/markusahlstrand/authhero/blob/main/packages/kysely/src/helpers/filter.ts) for the reference implementation.

### 4. Handle Multi-Tenancy

All database operations must be scoped to a tenant to ensure data isolation:

```typescript
export function get(db: MyDatabase) {
  return async (tenantId: string, userId: string): Promise<User | null> => {
    const user = await db
      .selectFrom("users")
      .where("tenant_id", "=", tenantId)  // Always filter by tenant
      .where("user_id", "=", userId)
      .selectAll()
      .executeTakeFirst();
      
    return user || null;
  };
}
```

**Critical for security:**
- **Always** include tenant_id in WHERE clauses
- **Never** expose cross-tenant data
- **Validate** tenant_id is provided before queries

### 5. Type Safety

Use TypeScript strictly and leverage the provided Zod schemas for validation:

```typescript
import { userSchema, type User } from "@authhero/adapter-interfaces";

export function create(db: MyDatabase) {
  return async (tenantId: string, userData: unknown): Promise<User> => {
    // Validate input using Zod schema
    const user = userSchema.parse(userData);
    
    // Type-safe database operations
    const inserted = await db.insertInto("users")
      .values({
        ...user,
        tenant_id: tenantId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
      
    return inserted;
  };
}
```

### 6. Testing Your Adapter

Write comprehensive tests for your adapter using Vitest:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createMyAdapter } from "./index";

describe("MyAdapter - Users", () => {
  let adapter: MyDatabaseAdapter;
  
  beforeEach(async () => {
    adapter = await createMyAdapter({
      // Test database config
    });
  });
  
  it("should create a user", async () => {
    const user = await adapter.users.create("tenant1", {
      email: "test@example.com",
      // ... other fields
    });
    
    expect(user.email).toBe("test@example.com");
    expect(user.tenant_id).toBe("tenant1");
  });
  
  it("should throw 409 for duplicate users", async () => {
    await adapter.users.create("tenant1", { email: "test@example.com" });
    
    await expect(
      adapter.users.create("tenant1", { email: "test@example.com" })
    ).rejects.toThrow(HTTPException);
  });
  
  it("should filter by tenant", async () => {
    await adapter.users.create("tenant1", { email: "user1@example.com" });
    await adapter.users.create("tenant2", { email: "user2@example.com" });
    
    const users = await adapter.users.list("tenant1", {});
    expect(users.users).toHaveLength(1);
    expect(users.users[0].email).toBe("user1@example.com");
  });
});
```

## Example: Minimal Adapter Structure

Here's a minimal adapter structure to get started:

```typescript
import { Kysely } from "kysely";
import { HTTPException } from "hono/http-exception";
import type {
  Users,
  Tenants,
  Applications,
  Connections,
  Logs,
  Sessions,
  Codes,
  Passwords,
} from "@authhero/adapter-interfaces";
import { Database } from "./db"; // Your database schema

export function createMyAdapter(db: Kysely<Database>) {
  return {
    users: createUsersAdapter(db),
    tenants: createTenantsAdapter(db),
    applications: createApplicationsAdapter(db),
    connections: createConnectionsAdapter(db),
    logs: createLogsAdapter(db),
    sessions: createSessionsAdapter(db),
    codes: createCodesAdapter(db),
    passwords: createPasswordsAdapter(db),
    // ... other required adapters
  };
}

function createUsersAdapter(db: Kysely<Database>): Users {
  return {
    create: async (tenantId, user) => {
      try {
        const result = await db
          .insertInto("users")
          .values({ ...user, tenant_id: tenantId })
          .returningAll()
          .executeTakeFirstOrThrow();
        return result;
      } catch (error: any) {
        if (error?.code === "UNIQUE_VIOLATION") {
          throw new HTTPException(409, { message: "User already exists" });
        }
        throw error;
      }
    },
    
    get: async (tenantId, userId) => {
      const user = await db
        .selectFrom("users")
        .where("tenant_id", "=", tenantId)
        .where("user_id", "=", userId)
        .selectAll()
        .executeTakeFirst();
      return user || null;
    },
    
    list: async (tenantId, params) => {
      const users = await db
        .selectFrom("users")
        .where("tenant_id", "=", tenantId)
        .selectAll()
        .execute();
      return { users };
    },
    
    update: async (tenantId, userId, updates) => {
      const user = await db
        .updateTable("users")
        .set(updates)
        .where("tenant_id", "=", tenantId)
        .where("user_id", "=", userId)
        .returningAll()
        .executeTakeFirstOrThrow();
      return user;
    },
    
    remove: async (tenantId, userId) => {
      await db
        .deleteFrom("users")
        .where("tenant_id", "=", tenantId)
        .where("user_id", "=", userId)
        .execute();
    },
  };
}

// Implement other adapters similarly...
```

## Best Practices

1. **Error Handling**: Always convert database errors to HTTPException
2. **Tenant Isolation**: Never forget to filter by tenant_id
3. **Type Safety**: Use TypeScript strictly and leverage Zod schemas
4. **Testing**: Write comprehensive tests for all CRUD operations
5. **Consistency**: Follow the patterns used in existing adapters
6. **Documentation**: Document adapter-specific configuration and limitations
7. **Performance**: Use database indexes and optimize queries
8. **Transactions**: Use transactions for multi-step operations when needed

## Reference Implementations

Study these reference implementations:

- **[Kysely Adapter](https://github.com/markusahlstrand/authhero/tree/main/packages/kysely)** - Comprehensive SQL adapter with advanced filtering
- **[AWS Adapter](https://github.com/markusahlstrand/authhero/tree/main/packages/aws)** - NoSQL adapter example without Lucene query support
- **[Cloudflare Adapter](https://github.com/markusahlstrand/authhero/tree/main/packages/cloudflare)** - Edge-optimized adapter with platform integrations

## Contributing

If you've built a custom adapter that others might find useful, consider contributing it to the AuthHero ecosystem. See the [Contributing Guide](/contributing/development-setup) for details.
