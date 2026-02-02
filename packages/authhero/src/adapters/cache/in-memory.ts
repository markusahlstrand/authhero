import { CacheAdapter, CacheItem } from "@authhero/adapter-interfaces";

export interface InMemoryCacheConfig {
  /**
   * Default TTL in seconds for cache entries (optional)
   */
  defaultTtlSeconds?: number;
  /**
   * Maximum number of entries in the cache (optional, for basic LRU behavior)
   */
  maxEntries?: number;
  /**
   * Interval in milliseconds for cleanup of expired entries (default: 60000ms = 1 minute)
   */
  cleanupIntervalMs?: number;
}

export class InMemoryCache implements CacheAdapter {
  private cache = new Map<string, CacheItem>();
  private accessOrder = new Map<string, number>(); // For LRU tracking
  private accessCounter = 0;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(private config: InMemoryCacheConfig = {}) {
    // Start periodic cleanup of expired entries (skip if cleanupIntervalMs is 0)
    const intervalMs = config.cleanupIntervalMs;
    if (intervalMs && intervalMs > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanupExpired();
      }, intervalMs);
    }
  }

  async get<T = any>(key: string): Promise<T | null> {
    const item = this.cache.get(key);

    if (!item) {
      return null;
    }

    // Check if expired
    if (item.expiresAt && item.expiresAt < new Date()) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      return null;
    }

    // Update access order for LRU
    this.accessOrder.set(key, ++this.accessCounter);

    return item.value as T;
  }

  async set<T = any>(
    key: string,
    value: T,
    ttlSeconds?: number,
  ): Promise<void> {
    // Calculate expiration time
    let expiresAt: Date | undefined;
    const rawTtl = ttlSeconds ?? this.config.defaultTtlSeconds;
    const hasTtl = rawTtl !== undefined;
    const ttl = hasTtl ? Math.max(0, rawTtl as number) : 0;
    if (hasTtl) {
      // For ttl=0 mark as already expired so get() never serves it
      expiresAt = new Date(Date.now() + (ttl > 0 ? ttl * 1000 : -1));
    }

    // Check if we need to evict entries (simple LRU)
    if (
      this.config.maxEntries &&
      this.cache.size >= this.config.maxEntries &&
      !this.cache.has(key)
    ) {
      this.evictLeastRecentlyUsed();
    }

    const item: CacheItem<T> = { value, expiresAt };
    this.cache.set(key, item);
    this.accessOrder.set(key, ++this.accessCounter);
  }

  async delete(key: string): Promise<boolean> {
    const existed = this.cache.has(key);
    this.cache.delete(key);
    this.accessOrder.delete(key);
    return existed;
  }

  async deleteByPrefix(prefix: string): Promise<number> {
    let deleted = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        this.accessOrder.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.accessOrder.clear();
    this.accessCounter = 0;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      maxEntries: this.config.maxEntries,
      defaultTtlSeconds: this.config.defaultTtlSeconds,
    };
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpired(): void {
    const now = new Date();
    const expiredKeys: string[] = [];

    for (const [key, item] of this.cache.entries()) {
      if (item.expiresAt && item.expiresAt < now) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLeastRecentlyUsed(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, accessTime] of this.accessOrder.entries()) {
      if (accessTime < oldestAccess) {
        oldestAccess = accessTime;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.accessOrder.delete(oldestKey);
    }
  }

  /**
   * Stop cleanup timer (useful for testing or graceful shutdown)
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }
}

/**
 * Create an in-memory cache adapter
 */
export function createInMemoryCache(
  config: InMemoryCacheConfig = {},
): CacheAdapter {
  return new InMemoryCache(config);
}
