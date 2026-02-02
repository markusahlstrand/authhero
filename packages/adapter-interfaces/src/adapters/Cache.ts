export interface CacheItem<T = any> {
  value: T;
  expiresAt?: Date;
}

export interface CacheAdapter {
  /**
   * Get a value from the cache
   * @param key The cache key
   * @returns The cached value or null if not found or expired
   */
  get<T = any>(key: string): Promise<T | null>;

  /**
   * Set a value in the cache
   * @param key The cache key
   * @param value The value to cache
   * @param ttlSeconds Time to live in seconds (optional)
   */
  set<T = any>(key: string, value: T, ttlSeconds?: number): Promise<void>;

  /**
   * Delete a value from the cache
   * @param key The cache key
   * @returns True if the key existed and was deleted, false otherwise
   */
  delete(key: string): Promise<boolean>;

  /**
   * Delete all values from the cache that match a key prefix
   * @param prefix The key prefix to match
   * @returns The number of keys deleted
   */
  deleteByPrefix(prefix: string): Promise<number>;

  /**
   * Clear all items from the cache
   */
  clear(): Promise<void>;
}
