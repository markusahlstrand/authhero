# Using Cache Adapters with AuthHero

This guide shows how to integrate cache adapters with your AuthHero setup for improved performance.

## Basic Setup with In-Memory Cache

```typescript
import { init } from "@authhero/authhero";
import { createInMemoryCache } from "@authhero/authhero";
import createKyselyAdapters from "@authhero/kysely";

// Create your database adapters
const db = // ... your Kysely database instance
const baseAdapters = createKyselyAdapters(db);

// Create a cache adapter
const cacheAdapter = createInMemoryCache({
  defaultTtlSeconds: 300, // 5 minutes default
  maxEntries: 1000, // LRU eviction after 1000 entries
  cleanupIntervalMs: 60000, // Clean expired entries every minute
});

// Combine database adapters with cache
const adapters = {
  ...baseAdapters,
  cache: cacheAdapter,
};

// Initialize AuthHero
const app = init({
  dataAdapter: adapters,
  // ... other config
});
```

## Setup with Cloudflare Cache (for Cloudflare Workers)

```typescript
import { init } from "@authhero/authhero";
import { createGlobalCloudflareCache } from "@authhero/cloudflare";
import createKyselyAdapters from "@authhero/kysely";

// Create your database adapters
const baseAdapters = createKyselyAdapters(db);

// Create a Cloudflare cache adapter
const cacheAdapter = await createGlobalCloudflareCache("authhero-cache", {
  keyPrefix: "auth",
  defaultTtlSeconds: 600, // 10 minutes default
});

// Combine database adapters with cache
const adapters = {
  ...baseAdapters,
  cache: cacheAdapter,
};

const app = init({
  dataAdapter: adapters,
  // ... other config
});
```

## Custom Cache Configuration

The management API and universal login use **request-scoped caching** by default to avoid stale data issues:

````typescript
## Cache Strategy

AuthHero uses a **hybrid caching approach** that adapts based on your configuration:

### 🔄 **Request-Scoped Caching (Default)**
When no cache adapter is provided in your DataAdapters:
```typescript
// Each request gets a fresh cache instance that only lives for that request
// This prevents stale data between different API calls while still providing
// performance benefits within a single request

// Benefits:
// - Data is always fresh between requests
// - No stale data issues
// - No cache invalidation complexity
// - Memory efficient (cache dies with request)
```

### 🚀 **Persistent Caching (When Cache Adapter Provided)**
When you provide a cache adapter in your DataAdapters:
```typescript
const adapters = {
  ...baseAdapters,
  cache: createInMemoryCache({ defaultTtlSeconds: 300 }), // or Cloudflare cache
};

// Uses 5-minute TTL for persistent caching across requests
// Better performance but potential for brief stale data
```

### 📋 **Cached Entities**
Both strategies cache the same entities (chosen for being read-heavy and relatively stable):
- **tenants**: Tenant configuration and settings
- **connections**: Authentication provider configurations
- **clients**: Client/application settings
- **branding**: UI customization settings
- **themes**: Theme and styling settings
- **promptSettings**: Authentication flow behavior settings
- **forms**: Custom form definitions

### ❌ **NOT Cached** (for data freshness and security):
- **users**: User data changes frequently
- **sessions**: Highly dynamic session data
- **codes**: Single-use OTP codes
- **passwords**: Security-sensitive data
- **loginSessions**: Temporary session state

**Note**: Write operations (create, update, delete) are never cached and always execute directly against the database.
```For persistent caching across requests (use with caution for stale data):

```typescript
// You can provide your own cache adapter in the DataAdapters interface
const persistentCache = createInMemoryCache({
  defaultTtlSeconds: 300, // 5 minutes TTL
  maxEntries: 1000,
});

const adapters = {
  ...baseAdapters,
  cache: persistentCache, // This cache will persist across requests
};
````

## Cache Key Strategy

The cache uses a key strategy based on:

- Adapter name (e.g., "tenants", "clients")
- Method name (e.g., "get", "list")
- Method arguments (JSON stringified)

Example cache keys:

- `tenants:get:["tenant-123"]`
- `clients:list:[{"tenant_id":"tenant-123"}]`
- `connections:get:["tenant-123","conn-456"]`

## Cache Invalidation

The current implementation uses **request-scoped caching** to avoid stale data issues:

- **Request-scoped**: Each API request gets a fresh cache that dies when the request completes
- **Write operations** (create, update, delete) are never cached
- **Read operations** are cached within the request scope for performance
- **No stale data** between different API requests

This approach provides:

1. **Performance benefits**: Repeated calls to the same data within a request are cached
2. **Data consistency**: Fresh data for each new request
3. **Simplicity**: No complex cache invalidation logic needed

For applications requiring persistent caching across requests, you can provide your own cache adapter, but consider the trade-offs with data freshness.

## Performance Considerations

### In-Memory Cache

- **Pros**: Very fast, no network overhead
- **Cons**: Memory usage grows with cache size, not shared across instances
- **Best for**: Single-instance deployments, development

### Cloudflare Cache

- **Pros**: Distributed across edge locations, shared across instances
- **Cons**: Network overhead for cache operations, limited by Cloudflare's cache policies
- **Best for**: Multi-instance deployments, production with global users

## Cache Adapter Interface

The cache adapter interface is simple and extensible:

```typescript
interface CacheAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
}
```

You can implement your own cache adapter for Redis, Memcached, or any other caching system by implementing this interface.
