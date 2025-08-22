import { CacheAdapter } from "@authhero/adapter-interfaces";

export interface CloudflareCacheConfig {
  /**
   * The Cloudflare cache instance to use
   */
  cache: Cache;
  /**
   * Default TTL in seconds for cache entries (optional)
   * Note: Cloudflare cache has its own TTL limits
   */
  defaultTtlSeconds?: number;
  /**
   * Key prefix to namespace cache entries (optional)
   */
  keyPrefix?: string;
}

/**
 * Cloudflare Cache API implementation of CacheAdapter
 * Uses Cloudflare's Cache API for distributed caching
 */
export class CloudflareCache implements CacheAdapter {
  constructor(private config: CloudflareCacheConfig) {}

  private getKey(key: string): string {
    return this.config.keyPrefix ? `${this.config.keyPrefix}:${key}` : key;
  }

  private createRequest(key: string): Request {
    // Create a dummy request with the cache key as URL
    // This is required by Cloudflare's Cache API
    return new Request(`https://cache.internal/${this.getKey(key)}`);
  }

  async get<T = any>(key: string): Promise<T | null> {
    try {
      const request = this.createRequest(key);
      const response = await this.config.cache.match(request);

      if (!response) {
        return null;
      }

      const data = await response.json();

      // Check if expired
      if (data.expiresAt) {
        const expiresAt = new Date(data.expiresAt);
        if (expiresAt < new Date()) {
          // Clean up expired entry
          await this.delete(key);
          return null;
        }
      }

      return data.value as T;
    } catch (error) {
      // Log error but don't throw - cache misses should not break the application
      console.warn(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  async set<T = any>(
    key: string,
    value: T,
    ttlSeconds?: number,
  ): Promise<void> {
    try {
      const ttl = ttlSeconds ?? this.config.defaultTtlSeconds;

      // Prepare cache data
      const cacheData = {
        value,
        expiresAt: ttl
          ? new Date(Date.now() + ttl * 1000).toISOString()
          : undefined,
        cachedAt: new Date().toISOString(),
      };

      const request = this.createRequest(key);
      const response = new Response(JSON.stringify(cacheData), {
        headers: {
          "Content-Type": "application/json",
          ...(ttl && { "Cache-Control": `max-age=${ttl}` }),
        },
      });

      await this.config.cache.put(request, response);
    } catch (error) {
      // Log error but don't throw - cache failures should not break the application
      console.warn(`Cache set error for key ${key}:`, error);
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const request = this.createRequest(key);
      // Cloudflare cache.delete returns true if the resource was deleted, false if not found
      return await this.config.cache.delete(request);
    } catch (error) {
      console.warn(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  async clear(): Promise<void> {
    // Note: Cloudflare Cache API doesn't have a clear all method
    // This is a limitation of the distributed cache
    // You could implement this by maintaining a list of keys, but that adds complexity
    console.warn(
      "CloudflareCache.clear() is not implemented - Cloudflare Cache API does not support clearing all entries",
    );
  }
}

/**
 * Create a Cloudflare cache adapter
 */
export function createCloudflareCache(
  config: CloudflareCacheConfig,
): CacheAdapter {
  return new CloudflareCache(config);
}

/**
 * Create a Cloudflare cache adapter using the global caches API
 * This is a convenience function for the most common use case
 */
export async function createGlobalCloudflareCache(
  cacheName: string = "default",
  options: Omit<CloudflareCacheConfig, "cache"> = {},
): Promise<CacheAdapter> {
  if (typeof caches === "undefined") {
    throw new Error(
      "caches API is not available - this function should only be used in Cloudflare Workers",
    );
  }

  const cache = await caches.open(cacheName);

  return new CloudflareCache({
    cache,
    ...options,
  });
}
