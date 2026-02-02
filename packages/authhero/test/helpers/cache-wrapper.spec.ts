import { describe, it, expect, beforeEach } from "vitest";
import { addCaching } from "../../src/helpers/cache-wrapper";
import { createInMemoryCache } from "../../src/adapters/cache/in-memory";
import { DataAdapters, Client } from "@authhero/adapter-interfaces";

describe("cache-wrapper", () => {
  let mockClients: Client[];
  let mockDataAdapter: Partial<DataAdapters>;
  let cache: ReturnType<typeof createInMemoryCache>;
  let getCallCount: number;
  let listCallCount: number;

  beforeEach(() => {
    mockClients = [
      {
        client_id: "client1",
        name: "Test Client 1",
        web_origins: ["https://example.com"],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Client,
      {
        client_id: "client2",
        name: "Test Client 2",
        web_origins: ["https://other.com"],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Client,
    ];

    getCallCount = 0;
    listCallCount = 0;

    mockDataAdapter = {
      clients: {
        get: async (tenantId: string, clientId: string) => {
          getCallCount++;
          return mockClients.find((c) => c.client_id === clientId) || null;
        },
        list: async () => {
          listCallCount++;
          return { clients: mockClients };
        },
        create: async (tenantId: string, client: any) => {
          const newClient = { ...client, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
          mockClients.push(newClient);
          return newClient;
        },
        update: async (tenantId: string, clientId: string, data: any) => {
          const index = mockClients.findIndex((c) => c.client_id === clientId);
          if (index >= 0) {
            mockClients[index] = { ...mockClients[index], ...data };
            return true;
          }
          return false;
        },
        remove: async (tenantId: string, clientId: string) => {
          const index = mockClients.findIndex((c) => c.client_id === clientId);
          if (index >= 0) {
            mockClients.splice(index, 1);
            return true;
          }
          return false;
        },
      },
    } as Partial<DataAdapters>;

    cache = createInMemoryCache({
      defaultTtlSeconds: 300,
      maxEntries: 100,
      cleanupIntervalMs: 0,
    });
  });

  describe("caching read operations", () => {
    it("should cache get results", async () => {
      const cachedData = addCaching(mockDataAdapter as DataAdapters, {
        defaultTtl: 300,
        cacheEntities: ["clients"],
        cache,
      });

      // First call should hit the database
      const result1 = await cachedData.clients.get("tenant1", "client1");
      expect(result1?.client_id).toBe("client1");
      expect(getCallCount).toBe(1);

      // Second call should hit the cache
      const result2 = await cachedData.clients.get("tenant1", "client1");
      expect(result2?.client_id).toBe("client1");
      expect(getCallCount).toBe(1); // Still 1, cache was used
    });

    it("should cache list results", async () => {
      const cachedData = addCaching(mockDataAdapter as DataAdapters, {
        defaultTtl: 300,
        cacheEntities: ["clients"],
        cache,
      });

      // First call should hit the database
      const result1 = await cachedData.clients.list("tenant1", {});
      expect(result1.clients.length).toBe(2);
      expect(listCallCount).toBe(1);

      // Second call should hit the cache
      const result2 = await cachedData.clients.list("tenant1", {});
      expect(result2.clients.length).toBe(2);
      expect(listCallCount).toBe(1); // Still 1, cache was used
    });
  });

  describe("cache invalidation on write operations", () => {
    it("should invalidate cache on update", async () => {
      const cachedData = addCaching(mockDataAdapter as DataAdapters, {
        defaultTtl: 300,
        cacheEntities: ["clients"],
        cache,
      });

      // Populate cache
      await cachedData.clients.get("tenant1", "client1");
      expect(getCallCount).toBe(1);

      // Verify cache is populated
      await cachedData.clients.get("tenant1", "client1");
      expect(getCallCount).toBe(1); // Cache hit

      // Update the client
      await cachedData.clients.update("tenant1", "client1", { name: "Updated Name" });

      // Cache should be invalidated, next get should hit database
      await cachedData.clients.get("tenant1", "client1");
      expect(getCallCount).toBe(2); // Cache was invalidated
    });

    it("should invalidate cache on remove", async () => {
      const cachedData = addCaching(mockDataAdapter as DataAdapters, {
        defaultTtl: 300,
        cacheEntities: ["clients"],
        cache,
      });

      // Populate cache
      await cachedData.clients.get("tenant1", "client1");
      expect(getCallCount).toBe(1);

      // Verify cache is populated
      await cachedData.clients.get("tenant1", "client1");
      expect(getCallCount).toBe(1); // Cache hit

      // Remove the client
      await cachedData.clients.remove("tenant1", "client1");

      // Cache should be invalidated, next get should hit database
      await cachedData.clients.get("tenant1", "client1");
      expect(getCallCount).toBe(2); // Cache was invalidated
    });

    it("should invalidate list cache on create", async () => {
      const cachedData = addCaching(mockDataAdapter as DataAdapters, {
        defaultTtl: 300,
        cacheEntities: ["clients"],
        cache,
      });

      // Populate cache with list
      const result1 = await cachedData.clients.list("tenant1", {});
      expect(result1.clients.length).toBe(2);
      expect(listCallCount).toBe(1);

      // Verify cache is populated
      await cachedData.clients.list("tenant1", {});
      expect(listCallCount).toBe(1); // Cache hit

      // Create a new client
      await cachedData.clients.create("tenant1", {
        client_id: "client3",
        name: "New Client",
      });

      // Cache should be invalidated, next list should hit database
      const result2 = await cachedData.clients.list("tenant1", {});
      expect(result2.clients.length).toBe(3);
      expect(listCallCount).toBe(2); // Cache was invalidated
    });
  });

  describe("deleteByPrefix", () => {
    it("should delete all keys matching prefix", async () => {
      // Set some cache entries directly
      await cache.set("clients:get:tenant1:client1", { client_id: "client1" });
      await cache.set("clients:get:tenant1:client2", { client_id: "client2" });
      await cache.set("clients:list:tenant1", { clients: [] });
      await cache.set("tenants:get:tenant1", { id: "tenant1" });

      // Delete all clients entries
      const deleted = await cache.deleteByPrefix("clients:");

      expect(deleted).toBe(3);

      // Verify clients entries are deleted
      expect(await cache.get("clients:get:tenant1:client1")).toBeNull();
      expect(await cache.get("clients:get:tenant1:client2")).toBeNull();
      expect(await cache.get("clients:list:tenant1")).toBeNull();

      // Verify tenants entry is still there
      expect(await cache.get("tenants:get:tenant1")).toEqual({ id: "tenant1" });
    });
  });
});
