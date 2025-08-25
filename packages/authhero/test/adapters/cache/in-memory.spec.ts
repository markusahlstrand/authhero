import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createInMemoryCache,
  InMemoryCache,
} from "../../../src/adapters/cache/in-memory";

describe("InMemoryCache", () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = createInMemoryCache() as InMemoryCache;
  });

  afterEach(() => {
    cache.destroy();
  });

  describe("basic operations", () => {
    it("should set and get values", async () => {
      await cache.set("key1", "value1");
      const result = await cache.get("key1");
      expect(result).toBe("value1");
    });

    it("should return null for non-existent keys", async () => {
      const result = await cache.get("non-existent");
      expect(result).toBeNull();
    });

    it("should delete values", async () => {
      await cache.set("key1", "value1");
      const deleted = await cache.delete("key1");
      expect(deleted).toBe(true);

      const result = await cache.get("key1");
      expect(result).toBeNull();
    });

    it("should return false when deleting non-existent keys", async () => {
      const deleted = await cache.delete("non-existent");
      expect(deleted).toBe(false);
    });

    it("should clear all values", async () => {
      await cache.set("key1", "value1");
      await cache.set("key2", "value2");

      await cache.clear();

      expect(await cache.get("key1")).toBeNull();
      expect(await cache.get("key2")).toBeNull();
    });
  });

  describe("TTL functionality", () => {
    it("should expire values after TTL", async () => {
      await cache.set("key1", "value1", 1); // 1 second TTL

      // Should be available immediately
      expect(await cache.get("key1")).toBe("value1");

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should be null after expiration
      expect(await cache.get("key1")).toBeNull();
    });

    it("should use default TTL when configured", async () => {
      const cacheWithDefaultTtl = createInMemoryCache({
        defaultTtlSeconds: 1,
      }) as InMemoryCache;

      await cacheWithDefaultTtl.set("key1", "value1"); // Uses default TTL
      expect(await cacheWithDefaultTtl.get("key1")).toBe("value1");

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(await cacheWithDefaultTtl.get("key1")).toBeNull();

      cacheWithDefaultTtl.destroy();
    });
  });

  describe("LRU eviction", () => {
    it("should evict least recently used items when max entries reached", async () => {
      const lruCache = createInMemoryCache({ maxEntries: 2 }) as InMemoryCache;

      await lruCache.set("key1", "value1");
      await lruCache.set("key2", "value2");

      // Access key1 to make it more recently used
      await lruCache.get("key1");

      // Add key3, should evict key2 (least recently used)
      await lruCache.set("key3", "value3");

      expect(await lruCache.get("key1")).toBe("value1"); // Should still exist
      expect(await lruCache.get("key2")).toBeNull(); // Should be evicted
      expect(await lruCache.get("key3")).toBe("value3"); // Should exist

      lruCache.destroy();
    });
  });

  describe("cleanup", () => {
    it("should clean up expired entries periodically", async () => {
      const cleanupCache = createInMemoryCache({
        cleanupIntervalMs: 100, // Very short interval for testing
      }) as InMemoryCache;

      await cleanupCache.set("key1", "value1", 0.5); // 0.5 second TTL

      // Wait for expiration and cleanup
      await new Promise((resolve) => setTimeout(resolve, 600));

      // The expired entry should be cleaned up
      expect(await cleanupCache.get("key1")).toBeNull();

      cleanupCache.destroy();
    });
  });

  describe("stats", () => {
    it("should return cache statistics", async () => {
      const statsCache = createInMemoryCache({
        maxEntries: 100,
        defaultTtlSeconds: 300,
      }) as InMemoryCache;

      await statsCache.set("key1", "value1");
      await statsCache.set("key2", "value2");

      const stats = statsCache.getStats();
      expect(stats).toEqual({
        size: 2,
        maxEntries: 100,
        defaultTtlSeconds: 300,
      });

      statsCache.destroy();
    });
  });

  describe("data types", () => {
    it("should handle different data types", async () => {
      // String
      await cache.set("string", "hello");
      expect(await cache.get("string")).toBe("hello");

      // Number
      await cache.set("number", 42);
      expect(await cache.get("number")).toBe(42);

      // Boolean
      await cache.set("boolean", true);
      expect(await cache.get("boolean")).toBe(true);

      // Object
      const obj = { name: "test", value: 123 };
      await cache.set("object", obj);
      expect(await cache.get("object")).toEqual(obj);

      // Array
      const arr = [1, 2, 3];
      await cache.set("array", arr);
      expect(await cache.get("array")).toEqual(arr);
    });
  });
});
