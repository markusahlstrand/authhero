import { DataAdapters, CacheAdapter } from "@authhero/adapter-interfaces";

/**
 * Configuration options for the cache wrapper
 */
export interface CacheOptions {
  /** Default TTL in seconds for cached items */
  defaultTtl: number;
  /** Custom TTLs for specific adapter methods (in seconds) */
  customTtls?: Record<string, number>;
  /** Methods to exclude from caching (e.g., ["users:update", "sessions:create"]) */
  excludeMethods?: string[];
  /** List of adapter entities to cache (if empty, all entities are cached) */
  cacheEntities?: string[];
  /** Cache adapter implementation */
  cache: CacheAdapter;
  /** Key prefix to ensure cache isolation (e.g., tenant ID) */
  keyPrefix?: string;
}

// Create a hash key from parameters for cache lookup
function createCacheKey(
  adapterName: string,
  methodName: string,
  args: any[],
  keyPrefix?: string,
): string {
  try {
    const baseKey = `${adapterName}:${methodName}:${JSON.stringify(args)}`;
    return keyPrefix ? `${keyPrefix}:${baseKey}` : baseKey;
  } catch (error) {
    // If arguments can't be stringified (e.g., contain circular references),
    // use a timestamp to ensure uniqueness but effectively disable caching
    const baseKey = `${adapterName}:${methodName}:${Date.now()}-${Math.random()}`;
    return keyPrefix ? `${keyPrefix}:${baseKey}` : baseKey;
  }
}

/**
 * Adds caching to data adapter methods using the new CacheAdapter interface
 * This wraps each method of the data adapter to cache its results based on input parameters
 */
export function addCaching(
  data: DataAdapters,
  options: CacheOptions,
): DataAdapters {
  const {
    cache,
    defaultTtl,
    customTtls = {},
    excludeMethods = [],
    cacheEntities = [],
    keyPrefix,
  } = options;

  const excludeMethodsSet = new Set(excludeMethods);
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
        if (excludeMethodsSet.has(methodKey)) {
          wrappedAdapter[methodName] = method;
          continue;
        }

        // Get TTL for this specific method or use default
        const ttl = customTtls[methodKey] ?? defaultTtl;

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
          // For write operations, we need to invalidate related cache entries
          if (isWriteOperation) {
            // Simple approach: clear all cache entries for this adapter
            // Note: Since our CacheAdapter doesn't have getKeysByPrefix, we can't do selective invalidation
            // In a production system, you might want to extend the CacheAdapter interface or
            // maintain a separate index of keys by adapter

            // For now, we'll just execute the write operation without cache invalidation
            // This means the cache might have stale data until TTL expires
            return await (method as any).apply(adapter, args);
          }

          // For read operations, try to get from cache first
          const cacheKey = createCacheKey(adapterName, methodName, args, keyPrefix);
          const cachedResult = await cache.get(cacheKey);

          if (cachedResult !== null) {
            return cachedResult;
          }

          // Cache miss, execute the original method
          const result = await (method as any).apply(adapter, args);

          // Cache the result - if TTL is 0, cache without expiration (useful for request-scoped caching)
          if (ttl >= 0) {
            await cache.set(cacheKey, result, ttl);
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
