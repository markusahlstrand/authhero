# Cache Adapters

This directory contains cache adapter implementations for AuthHero.

## Available Adapters

### In-Memory Cache (`createInMemoryCache`)

A simple in-memory cache implementation with TTL support and basic LRU eviction.

```typescript
import { createInMemoryCache } from "@authhero/authhero/adapters/cache";

// Create with default settings
const cache = createInMemoryCache();

// Create with custom configuration
const cache = createInMemoryCache({
  defaultTtlSeconds: 300, // 5 minutes default TTL
  maxEntries: 1000, // Maximum 1000 entries (LRU eviction)
  cleanupIntervalMs: 30000, // Clean up expired entries every 30 seconds
});

// Basic usage
await cache.set("user:123", userData, 600); // Cache for 10 minutes
const userData = await cache.get("user:123");
await cache.delete("user:123");
await cache.clear();
```

### Cloudflare Cache (`createCloudflareCache`)

Uses Cloudflare's Cache API for distributed caching in Workers.

```typescript
import {
  createCloudflareCache,
  createGlobalCloudflareCache,
} from "@authhero/cloudflare";

// Using specific cache instance
const cache = createCloudflareCache({
  cache: caches.default,
  keyPrefix: "auth", // Optional namespace
  defaultTtlSeconds: 300,
});

// Using global cache (convenience function)
const cache = await createGlobalCloudflareCache("auth-cache", {
  keyPrefix: "auth",
  defaultTtlSeconds: 300,
});

// Basic usage (same interface as in-memory cache)
await cache.set("session:abc", sessionData, 1800); // Cache for 30 minutes
const sessionData = await cache.get("session:abc");
await cache.delete("session:abc");
// Note: clear() is not supported by Cloudflare Cache API
```

## Integration with AuthHero

Cache adapters can be used throughout the AuthHero system for:

- Session caching
- User data caching
- Authentication state caching
- Rate limiting counters
- Temporary token storage

The cache adapter interface is designed to be simple and consistent across different implementations.
