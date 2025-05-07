import { DataAdapters } from "@authhero/adapter-interfaces";

/**
 * Interface for cache implementations
 * This allows for different caching strategies (memory, Cloudflare KV, etc.)
 */
export interface CacheInterface {
  set<T>(key: string, value: T, ttlMs: number): void | Promise<void>;
  get<T>(key: string): T | undefined | Promise<T | undefined>;
  delete(key: string): void | Promise<void>;
  getKeysByPrefix(prefix: string): string[] | Promise<string[]>;
  clear(): void | Promise<void>;
}

// Cache item with value and expiration time
interface CacheItem<T> {
  value: T;
  expiresAt: number;
}

// In-memory cache storage
class MemoryCache implements CacheInterface {
  private static instance: MemoryCache;
  private cacheStore: Map<string, CacheItem<any>> = new Map();

  private constructor() {
    // Private constructor to prevent direct construction calls with the `new` operator
  }

  // Get the singleton instance
  public static getInstance(): MemoryCache {
    if (!MemoryCache.instance) {
      MemoryCache.instance = new MemoryCache();
    }
    return MemoryCache.instance;
  }

  // Set a value in the cache with TTL in milliseconds
  set<T>(key: string, value: T, ttlMs: number): void {
    if (ttlMs <= 0) {
      // TTL ≤ 0 ⇒ do not cache
      return;
    }
    const expiresAt = Date.now() + ttlMs;
    this.cacheStore.set(key, { value, expiresAt });
  }

  // Get a value from the cache (returns undefined if expired or missing)
  get<T>(key: string): T | undefined {
    const item = this.cacheStore.get(key);

    if (!item) return undefined;

    // Check if the item has expired
    if (Date.now() > item.expiresAt) {
      this.cacheStore.delete(key);
      return undefined;
    }

    return item.value as T;
  }

  // Remove a value from the cache
  delete(key: string): void {
    this.cacheStore.delete(key);
  }

  // Get all keys that match a prefix
  getKeysByPrefix(prefix: string): string[] {
    return Array.from(this.cacheStore.keys()).filter((key) =>
      key.startsWith(prefix),
    );
  }

  // Clear the entire cache
  clear(): void {
    this.cacheStore.clear();
  }
}

// Create a hash key from parameters for cache lookup
function createCacheKey(
  adapterName: string,
  methodName: string,
  args: any[],
): string {
  try {
    return `${adapterName}:${methodName}:${JSON.stringify(args)}`;
  } catch (error) {
    // If arguments can't be stringified (e.g., contain circular references),
    // use a timestamp to ensure uniqueness but effectively disable caching
    return `${adapterName}:${methodName}:${Date.now()}-${Math.random()}`;
  }
}

/**
 * Configuration options for the cache wrapper
 */
export interface CacheOptions {
  /** Default TTL in milliseconds for cached items */
  defaultTtl: number;
  /** Custom TTLs for specific adapter methods */
  customTtls?: Record<string, number>;
  /** Methods to exclude from caching (e.g., ["users:update", "sessions:create"]) */
  excludeMethods?: string[];
  /** Maximum number of cached items (0 for unlimited) */
  maxItems?: number;
  /** List of adapter entities to cache (if empty, all entities are cached) */
  cacheEntities?: string[];
  /** Custom cache implementation (defaults to in-memory cache) */
  cache?: CacheInterface;
}

/**
 * Adds caching to data adapter methods
 * This wraps each method of the data adapter to cache its results based on input parameters
 */
export function addCaching(
  data: DataAdapters,
  options: CacheOptions,
): DataAdapters {
  const cache = options.cache || MemoryCache.getInstance();
  const defaultTtl = options.defaultTtl;
  const customTtls = options.customTtls || {};
  const excludeMethods = new Set(options.excludeMethods || []);
  const maxItems = options.maxItems || 0;

  // Set up entities to cache
  const cacheEntities = options.cacheEntities || [];
  const shouldCacheAllEntities = cacheEntities.length === 0;
  const entitiesToCache = new Set(cacheEntities);

  const wrappedAdapters: Record<string, any> = {};

  // Process each adapter
  for (const [adapterName, adapter] of Object.entries(data)) {
    // Check if this adapter entity should be cached
    const shouldCacheEntity =
      shouldCacheAllEntities || entitiesToCache.has(adapterName);

    const wrappedAdapter: Record<string, any> = {};

    // Process each method in the adapter
    for (const [methodName, method] of Object.entries(
      adapter as Record<string, any>,
    )) {
      if (typeof method === "function") {
        // If this adapter entity shouldn't be cached, just pass through the original method
        if (!shouldCacheEntity) {
          wrappedAdapter[methodName] = method;
          continue;
        }

        // Check if this method should be excluded from caching
        const methodKey = `${adapterName}:${methodName}`;
        if (excludeMethods.has(methodKey)) {
          wrappedAdapter[methodName] = method;
          continue;
        }

        // Get TTL for this specific method or use default
        const ttl = customTtls[methodKey] || defaultTtl;

        // Determine if this is a write operation (generally should not be cached)
        const isWriteOperation = [
          "create",
          "update",
          "remove",
          "delete",
          "set",
          "used",
        ].includes(methodName);

        // Wrap the method with caching logic
        wrappedAdapter[methodName] = async (...args: any[]) => {
          // For write operations, invalidate cache entries related to the adapter
          if (isWriteOperation) {
            // Simple approach: clear all cache entries for this adapter
            // A more sophisticated approach would be to selectively invalidate related entries
            const keysToDelete = await Promise.resolve(
              cache.getKeysByPrefix(`${adapterName}:`),
            );
            for (const key of keysToDelete) {
              await Promise.resolve(cache.delete(key));
            }

            // Execute the original method without caching
            return await (method as any).apply(adapter, args);
          }

          // For read operations, try to get from cache first
          const cacheKey = createCacheKey(adapterName, methodName, args);
          const cachedResult = await Promise.resolve(cache.get(cacheKey));

          if (cachedResult !== undefined) {
            return cachedResult;
          }

          // Cache miss, execute the original method
          const result = await (method as any).apply(adapter, args);

          await cache.set(cacheKey, result, ttl);

          // If we've set a max items limit and it's greater than 0,
          // we'll need to check the cache size
          // Note: This is a simple approach that might become inefficient
          // for very large caches. A more sophisticated eviction strategy
          // could be implemented if needed.
          if (maxItems > 0) {
            const allKeys = await Promise.resolve(cache.getKeysByPrefix(""));
            if (allKeys.length > maxItems) {
              // Remove oldest items first (though we don't actually track age)
              // In a more sophisticated implementation, we could use LRU policy
              const keysToRemove = allKeys.slice(0, allKeys.length - maxItems);
              for (const key of keysToRemove) {
                await Promise.resolve(cache.delete(key));
              }
            }
          }

          return result;
        };
      } else {
        // For non-function properties, just copy them as is
        wrappedAdapter[methodName] = method;
      }
    }

    wrappedAdapters[adapterName] = wrappedAdapter;
  }

  return wrappedAdapters as DataAdapters;
}
