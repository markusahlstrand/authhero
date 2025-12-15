# @authhero/adapter-interfaces

This package provides a set of interfaces used for creating adapters for AuthHero. Adapters are used to connect AuthHero to various services, such as databases, email services, and more.

## Database adapters

The database adapters follow these rules:

- The created_at and modified_at fields are handled by the adapter when creating or updating a record.
- The tenant_id field is not part of the entities sent to the adapter.
- The entity id is passed to the adapter.
- The adapter can pass objects such as authParams. These objects will typically be flattened as part of the adapter.
- The types used in the adapters should be inferred from zod schemas to ensure type safety at runtime.
- The id column and entity should typically start with the entity name, e.g. user_id for the user entity. We follow the naming from auth0 so it might not always be consistent.
- The adapter should typically expose the following methods.
  - `create(tenant_id: string, entity: Entity): Promise<Entity>`
  - `update(tenant_id: string, entity: Entity): Promise<boolean>`
  - `remove(tenant_id: string, entity: Entity): Promise<boolean>`
  - `get(tenant_id: string, [entity_id]: string): Promise<Entity | null>`
  - `list(tenant_id: string, query: Query): Promise<Entity[]>`

## Utilities

### Passthrough Adapter

The `createPassthroughAdapter` utility allows you to sync write operations to multiple adapter implementations. This is useful for:

- **Multi-destination logging**: Write logs to both a database and an analytics service
- **Cache warming**: Sync writes to multiple cache layers
- **Database migration**: Gradually migrate data from one database to another

#### Basic Usage

```typescript
import { createPassthroughAdapter, LogsDataAdapter } from "@authhero/adapter-interfaces";

// Primary adapter - all reads come from here, writes go here first
const primaryAdapter = createDatabaseLogsAdapter();

// Secondary adapter for analytics
const analyticsAdapter = createAnalyticsLogsAdapter();

// Create passthrough adapter
const logsAdapter = createPassthroughAdapter<LogsDataAdapter>({
  primary: primaryAdapter,
  secondaries: [
    {
      adapter: { create: analyticsAdapter.create },
      onError: (err) => console.error("Analytics sync failed:", err),
    },
  ],
});

// Usage
await logsAdapter.create("tenant-1", log); // Writes to both
const result = await logsAdapter.list("tenant-1"); // Reads from primary only
```

#### Configuration Options

```typescript
interface PassthroughConfig<T> {
  // Primary adapter - all reads come from here, writes go here first
  primary: T;

  // Secondary adapters to sync writes to
  secondaries: {
    // Partial adapter implementation - only implemented methods will be called
    adapter: Partial<T>;

    // If true, wait for the secondary write to complete (default: false)
    blocking?: boolean;

    // Called when a secondary write fails
    onError?: (error: Error, method: string, args: unknown[]) => void;
  }[];

  // Methods to sync to secondaries (default: ["create", "update", "remove", "delete", "set"])
  syncMethods?: string[];
}
```

#### Write-Only Adapter Helper

Use `createWriteOnlyAdapter` to clearly indicate which methods a secondary implements:

```typescript
import { createWriteOnlyAdapter, createPassthroughAdapter } from "@authhero/adapter-interfaces";

const logsAdapter = createPassthroughAdapter({
  primary: databaseAdapter,
  secondaries: [
    {
      adapter: createWriteOnlyAdapter({
        create: async (tenantId, log) => {
          // Custom write logic (e.g., webhook, analytics)
        },
      }),
    },
  ],
});
```

#### Use Cases

**Logs to multiple destinations:**

```typescript
const logsAdapter = createPassthroughAdapter({
  primary: databaseLogsAdapter,
  secondaries: [
    { adapter: { create: analyticsEngineAdapter.create } },
    { adapter: { create: r2SqlAdapter.create } },
  ],
});
```

**Cache with fallback sync:**

```typescript
const cacheAdapter = createPassthroughAdapter({
  primary: redisCacheAdapter,
  secondaries: [
    { adapter: memcachedAdapter, blocking: true },
  ],
  syncMethods: ["set", "delete"],
});
```
