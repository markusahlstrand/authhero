import { CacheAdapter } from "@authhero/adapter-interfaces";

// Extend CacheStorage to include Cloudflare's default cache
declare global {
  interface CacheStorage {
    default: Cache;
  }
}

export interface CloudflareCacheConfig {
  /**
   * The cache name to use (optional, defaults to edge cache)
   * If not provided, uses caches.default (Cloudflare edge cache)
   * If provided, uses caches.open() (Worker-local cache storage)
   */
  cacheName?: string;
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
  private cache: Cache | null = null;

  constructor(private config: CloudflareCacheConfig) {}

  private async getCache(): Promise<Cache> {
    if (this.cache) {
      return this.cache;
    }

    if (typeof caches === "undefined") {
      throw new Error(
        "caches API is not available - CloudflareCache should only be used in Cloudflare Workers",
      );
    }

    if (this.config.cacheName) {
      this.cache = await caches.open(this.config.cacheName);
    } else {
      // Use Cloudflare's default edge cache
      this.cache = caches.default;
    }

    return this.cache;
  }

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
      const cache = await this.getCache();
      const request = this.createRequest(key);
      const response = await cache.match(request);

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
      console.error(`CloudflareCache: get error for key ${key}:`, error);
      return null;
    }
  }

  async set<T = any>(
    key: string,
    value: T,
    ttlSeconds?: number,
  ): Promise<void> {
    try {
      const cache = await this.getCache();
      const rawTtl = ttlSeconds ?? this.config.defaultTtlSeconds;
      const hasTtl = rawTtl !== undefined;
      const ttl = hasTtl ? Math.max(0, rawTtl as number) : 0;

      // Prepare cache data
      const cacheData = {
        value,
        expiresAt: hasTtl
          ? new Date(Date.now() + (ttl > 0 ? ttl * 1000 : -1)).toISOString()
          : undefined,
        cachedAt: new Date().toISOString(),
      };

      const request = this.createRequest(key);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (hasTtl && ttl > 0) {
        headers["Cache-Control"] = `max-age=${ttl}`;
      }

      const response = new Response(JSON.stringify(cacheData), {
        headers,
      });

      await cache.put(request, response);
    } catch (error) {
      // Log error but don't throw - cache failures should not break the application
      console.error(`CloudflareCache: set error for key ${key}:`, error);
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const cache = await this.getCache();
      const request = this.createRequest(key);
      // Cloudflare cache.delete returns true if the resource was deleted, false if not found
      return await cache.delete(request);
    } catch (error) {
      console.error(`CloudflareCache: delete error for key ${key}:`, error);
      return false;
    }
  }

  async deleteByPrefix(_prefix: string): Promise<number> {
    // Note: Cloudflare Cache API doesn't support listing or prefix-based deletion
    // This is a limitation of the distributed cache
    // For production use cases requiring cache invalidation, consider using
    // Cloudflare's Purge API or a different caching strategy
    console.warn(
      "CloudflareCache.deleteByPrefix() is not implemented - Cloudflare Cache API does not support prefix-based deletion",
    );
    return 0;
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
  config: CloudflareCacheConfig = {},
): CacheAdapter {
  // Apply defaults
  const configWithDefaults: CloudflareCacheConfig = {
    defaultTtlSeconds: 300, // 5 minutes default
    keyPrefix: "authhero", // default prefix
    ...config, // user config overrides defaults
  };

  return new CloudflareCache(configWithDefaults);
}
