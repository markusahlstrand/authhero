---
title: Cache Adapter
description: High-performance caching using Cloudflare's Cache API. Get, set, and delete cached data with TTL and key prefixing support.
---

# Cache Adapter

The Cache adapter provides caching using Cloudflare's Cache API for high-performance data storage.

## Configuration

```typescript
{
  cacheName?: string;          // Cache name (default: "default")
  defaultTtlSeconds?: number;  // Default TTL in seconds
  keyPrefix?: string;          // Key prefix for namespacing
}
```

## Methods

- `get<T>(key: string)` - Get a value from cache
- `set<T>(key: string, value: T, ttl?: number)` - Set a value with optional TTL
- `delete(key: string)` - Delete a value from cache

## Usage Example

```typescript
// Cache user data
await cache.set("user:123", userData, 3600); // Cache for 1 hour

// Retrieve from cache
const user = await cache.get<User>("user:123");

// Delete from cache
await cache.delete("user:123");

// Use with key prefix
const prefixedCache = createAdapters({
  // ... other config
  keyPrefix: "authhero:",
});

// This will store as "authhero:user:123"
await prefixedCache.cache.set("user:123", userData);
```

## Caching Strategy Example

```typescript
async function getUserWithCache(userId: string, tenantId: string) {
  const cacheKey = `user:${userId}:${tenantId}`;

  // Try cache first
  let user = await cache.get<User>(cacheKey);

  if (!user) {
    // Fetch from database
    user = await database.users.get(userId, tenantId);

    // Cache for 5 minutes
    await cache.set(cacheKey, user, 300);
  }

  return user;
}
```

## Environment Variables

```env
# Cache (optional)
CACHE_NAME=default
CACHE_DEFAULT_TTL=3600
CACHE_KEY_PREFIX=authhero:
```

## Best Practices

### 1. Cache Strategy

Implement a layered caching strategy:

```typescript
async function getDataWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = 300,
): Promise<T> {
  // Try cache first
  const cached = await cache.get<T>(key);
  if (cached) return cached;

  // Fetch from source
  const data = await fetcher();

  // Cache for next time
  await cache.set(key, data, ttl);

  return data;
}

// Usage
const user = await getDataWithCache(
  `user:${userId}`,
  () => database.users.get(userId, tenantId),
  600, // 10 minutes
);
```

### 2. Cache Invalidation

Clear cache when data changes:

```typescript
async function updateDomain(tenantId: string, domainId: string, updates: any) {
  // Update in database
  const updated = await customDomains.update(tenantId, domainId, updates);

  // Invalidate cache
  await cache.delete(`domain:${updated.domain}`);
  await cache.delete(`domain:${domainId}`);

  return updated;
}
```

### 3. Cache TTL

Set appropriate TTL based on data volatility:

```typescript
// Short TTL for frequently changing data
await cache.set("session:123", sessionData, 300); // 5 minutes

// Longer TTL for stable data
await cache.set("tenant:config:123", tenantConfig, 3600); // 1 hour

// Very long TTL for rarely changing data
await cache.set("public:config", publicConfig, 86400); // 24 hours
```

## Troubleshooting

### Cache Issues

```typescript
// Clear all cache with prefix (requires version tracking)
async function clearCacheByPrefix(prefix: string) {
  // Note: Cloudflare Cache API doesn't support prefix clearing
  // You'll need to track keys separately or use a versioning strategy
  const version = (await cache.get<number>("cache:version")) || 0;
  await cache.set("cache:version", version + 1);
}

// Using cache versioning
async function getWithVersion<T>(key: string): Promise<T | null> {
  const version = (await cache.get<number>("cache:version")) || 0;
  const versionedKey = `${key}:v${version}`;
  return cache.get<T>(versionedKey);
}

async function setWithVersion<T>(
  key: string,
  value: T,
  ttl?: number,
): Promise<void> {
  const version = (await cache.get<number>("cache:version")) || 0;
  const versionedKey = `${key}:v${version}`;
  await cache.set(versionedKey, value, ttl);
}
```

## Related Documentation

- [Cloudflare Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)
- [AuthHero Cloudflare Adapter Overview](/adapters/cloudflare/)
