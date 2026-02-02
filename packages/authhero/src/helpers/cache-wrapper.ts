import { DataAdapters, CacheAdapter } from "@authhero/adapter-interfaces";

// Wrapper type to handle null values in cache
type CacheValue<T> = {
  value: T;
  isCachedNull: boolean;
};

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
    // Skip undefined optional adapters (e.g., geo, cache)
    if (adapter === undefined || adapter === null) {
      continue;
    }

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
          // For write operations, invalidate related cache entries
          if (isWriteOperation) {
            // Execute the write operation first
            const result = await (method as any).apply(adapter, args);

            // Invalidate cache entries (best-effort - don't fail the write if cache invalidation fails)
            try {
              // Invalidate specific cache entries for the modified entity
              // For update/remove operations, args typically are [tenant_id, entity_id, ...data]
              // For create operations, args typically are [tenant_id, data]
              if (
                args.length >= 2 &&
                ["update", "remove", "delete"].includes(methodName)
              ) {
                // Invalidate the "get" cache for this specific entity
                const getCacheKey = createCacheKey(
                  adapterName,
                  "get",
                  [args[0], args[1]], // tenant_id, entity_id
                  keyPrefix,
                );
                await cache.delete(getCacheKey);

                // Also invalidate the "list" cache for this tenant (without pagination params)
                // This helps invalidate lists that might include this entity
                const listCacheKey = createCacheKey(
                  adapterName,
                  "list",
                  [args[0], {}], // tenant_id with empty options
                  keyPrefix,
                );
                await cache.delete(listCacheKey);
              }

              // Try to invalidate all caches for this adapter by prefix (best effort)
              // This works for in-memory cache but may not work for distributed caches
              const cachePrefix = keyPrefix
                ? `${keyPrefix}:${adapterName}:`
                : `${adapterName}:`;
              await cache.deleteByPrefix(cachePrefix);
            } catch {
              // Swallow cache invalidation errors - the write succeeded and that's what matters
              // Stale cache entries will eventually expire based on TTL
            }

            return result;
          }

          // For read operations, try to get from cache first
          const cacheKey = createCacheKey(
            adapterName,
            methodName,
            args,
            keyPrefix,
          );

          const cachedResult = await cache.get(cacheKey);

          if (cachedResult !== null) {
            // Check if this is a wrapped cached value or a direct cached value
            if (
              cachedResult &&
              typeof cachedResult === "object" &&
              "isCachedNull" in cachedResult
            ) {
              const wrappedValue = cachedResult as CacheValue<any>;
              return wrappedValue.isCachedNull ? null : wrappedValue.value;
            } else {
              // Direct cached value (backward compatibility)
              return cachedResult;
            }
          }

          // Cache miss, execute the original method
          const result = await (method as any).apply(adapter, args);

          // Cache the result
          if (ttl >= 0) {
            if (result !== null) {
              // Cache successful results
              await cache.set(cacheKey, result, ttl);
            } else {
              // Cache null results (misses) using wrapper to distinguish from cache miss
              const wrappedValue: CacheValue<null> = {
                value: null,
                isCachedNull: true,
              };
              await cache.set(cacheKey, wrappedValue, ttl);
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
