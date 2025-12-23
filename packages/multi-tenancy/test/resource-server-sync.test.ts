import { describe, it, expect, beforeEach, vi } from "vitest";
import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import { Database } from "@authhero/kysely-adapter";
import createAdapters, { migrateToLatest } from "@authhero/kysely-adapter";
import {
  createResourceServerSyncHooks,
  createTenantResourceServerSyncHooks,
} from "../src/hooks/resource-server-sync";
import { DataAdapters, ResourceServer } from "@authhero/adapter-interfaces";
import { TenantHookContext } from "../src/types";

/**
 * Helper to find a resource server by identifier using the list query
 */
async function findByIdentifier(
  adapters: ReturnType<typeof createAdapters>,
  tenantId: string,
  identifier: string,
): Promise<ResourceServer | null> {
  const result = await adapters.resourceServers.list(tenantId, {
    q: `identifier:${identifier}`,
    per_page: 1,
  });
  return result.resource_servers[0] ?? null;
}

describe("Resource Server Sync Hooks", () => {
  let mainDb: Kysely<Database>;
  let tenant1Db: Kysely<Database>;
  let tenant2Db: Kysely<Database>;
  let mainAdapters: ReturnType<typeof createAdapters>;
  let tenant1Adapters: ReturnType<typeof createAdapters>;
  let tenant2Adapters: ReturnType<typeof createAdapters>;

  // Map of tenant ID to adapters for easy lookup
  let adaptersMap: Map<string, ReturnType<typeof createAdapters>>;

  beforeEach(async () => {
    // Create in-memory SQLite databases for each tenant
    mainDb = new Kysely<Database>({
      dialect: new SqliteDialect({ database: new SQLite(":memory:") }),
    });
    tenant1Db = new Kysely<Database>({
      dialect: new SqliteDialect({ database: new SQLite(":memory:") }),
    });
    tenant2Db = new Kysely<Database>({
      dialect: new SqliteDialect({ database: new SQLite(":memory:") }),
    });

    // Run migrations on all databases
    await migrateToLatest(mainDb, false);
    await migrateToLatest(tenant1Db, false);
    await migrateToLatest(tenant2Db, false);

    // Create adapters for each tenant
    mainAdapters = createAdapters(mainDb);
    tenant1Adapters = createAdapters(tenant1Db);
    tenant2Adapters = createAdapters(tenant2Db);

    // Setup adapters map
    adaptersMap = new Map([
      ["main", mainAdapters],
      ["tenant1", tenant1Adapters],
      ["tenant2", tenant2Adapters],
    ]);

    // Create tenants in their respective databases
    await mainAdapters.tenants.create({
      id: "main",
      friendly_name: "Main Tenant",
      audience: "https://main.example.com",
      sender_email: "admin@main.example.com",
      sender_name: "Main",
    });

    await tenant1Adapters.tenants.create({
      id: "tenant1",
      friendly_name: "Tenant 1",
      audience: "https://tenant1.example.com",
      sender_email: "admin@tenant1.example.com",
      sender_name: "Tenant 1",
    });

    await tenant2Adapters.tenants.create({
      id: "tenant2",
      friendly_name: "Tenant 2",
      audience: "https://tenant2.example.com",
      sender_email: "admin@tenant2.example.com",
      sender_name: "Tenant 2",
    });
  });

  describe("createResourceServerSyncHooks", () => {
    it("should sync a new resource server from main tenant to all child tenants", async () => {
      const hooks = createResourceServerSyncHooks({
        mainTenantId: "main",
        getChildTenantIds: async () => ["tenant1", "tenant2"],
        getAdapters: async (tenantId) => adaptersMap.get(tenantId)!,
      });

      // Create a resource server on the main tenant
      const resourceServer = await mainAdapters.resourceServers.create("main", {
        name: "My API",
        identifier: "https://api.example.com",
        scopes: [
          { value: "read:users", description: "Read users" },
          { value: "write:users", description: "Write users" },
        ],
        token_lifetime: 3600,
      });

      // Call the afterCreate hook
      await hooks.afterCreate!(
        { tenantId: "main", adapters: mainAdapters },
        resourceServer,
      );

      // Verify resource server was synced to tenant1
      const tenant1RS = await findByIdentifier(
        tenant1Adapters,
        "tenant1",
        "https://api.example.com",
      );
      expect(tenant1RS).toBeDefined();
      expect(tenant1RS?.name).toBe("My API");
      expect(tenant1RS?.identifier).toBe("https://api.example.com");
      expect(tenant1RS?.scopes).toHaveLength(2);
      expect(tenant1RS?.token_lifetime).toBe(3600);

      // Verify resource server was synced to tenant2
      const tenant2RS = await findByIdentifier(
        tenant2Adapters,
        "tenant2",
        "https://api.example.com",
      );
      expect(tenant2RS).toBeDefined();
      expect(tenant2RS?.name).toBe("My API");
      expect(tenant2RS?.identifier).toBe("https://api.example.com");
    });

    it("should not sync resource servers created on child tenants", async () => {
      const hooks = createResourceServerSyncHooks({
        mainTenantId: "main",
        getChildTenantIds: async () => ["tenant1", "tenant2"],
        getAdapters: async (tenantId) => adaptersMap.get(tenantId)!,
      });

      // Create a resource server on tenant1 (not main)
      const resourceServer = await tenant1Adapters.resourceServers.create(
        "tenant1",
        {
          name: "Tenant 1 API",
          identifier: "https://tenant1-api.example.com",
        },
      );

      // Call the afterCreate hook with tenant1 context
      await hooks.afterCreate!(
        { tenantId: "tenant1", adapters: tenant1Adapters },
        resourceServer,
      );

      // Verify resource server was NOT synced to main or tenant2
      const mainRS = await findByIdentifier(
        mainAdapters,
        "main",
        "https://tenant1-api.example.com",
      );
      expect(mainRS).toBeNull();

      const tenant2RS = await findByIdentifier(
        tenant2Adapters,
        "tenant2",
        "https://tenant1-api.example.com",
      );
      expect(tenant2RS).toBeNull();
    });

    it("should sync resource server updates from main tenant", async () => {
      const hooks = createResourceServerSyncHooks({
        mainTenantId: "main",
        getChildTenantIds: async () => ["tenant1", "tenant2"],
        getAdapters: async (tenantId) => adaptersMap.get(tenantId)!,
      });

      // Create resource server on main and sync it
      const resourceServer = await mainAdapters.resourceServers.create("main", {
        name: "My API",
        identifier: "https://api.example.com",
        token_lifetime: 3600,
      });

      await hooks.afterCreate!(
        { tenantId: "main", adapters: mainAdapters },
        resourceServer,
      );

      // Update the resource server on main (using the resource server's actual id)
      await mainAdapters.resourceServers.update("main", resourceServer.id, {
        name: "My Updated API",
        token_lifetime: 7200,
        scopes: [{ value: "admin", description: "Admin access" }],
      });

      // Get the updated resource server
      const updatedRS = await findByIdentifier(
        mainAdapters,
        "main",
        "https://api.example.com",
      );

      // Call the afterUpdate hook
      await hooks.afterUpdate!(
        { tenantId: "main", adapters: mainAdapters },
        "https://api.example.com",
        updatedRS!,
      );

      // Verify updates were synced to tenant1
      const tenant1RS = await findByIdentifier(
        tenant1Adapters,
        "tenant1",
        "https://api.example.com",
      );
      expect(tenant1RS?.name).toBe("My Updated API");
      expect(tenant1RS?.token_lifetime).toBe(7200);
      expect(tenant1RS?.scopes).toHaveLength(1);
      expect(tenant1RS?.scopes?.[0]?.value).toBe("admin");

      // Verify updates were synced to tenant2
      const tenant2RS = await findByIdentifier(
        tenant2Adapters,
        "tenant2",
        "https://api.example.com",
      );
      expect(tenant2RS?.name).toBe("My Updated API");
      expect(tenant2RS?.token_lifetime).toBe(7200);
    });

    it("should sync resource server deletions from main tenant", async () => {
      const hooks = createResourceServerSyncHooks({
        mainTenantId: "main",
        getChildTenantIds: async () => ["tenant1", "tenant2"],
        getAdapters: async (tenantId) => adaptersMap.get(tenantId)!,
      });

      // Create resource server on main and sync it
      const resourceServer = await mainAdapters.resourceServers.create("main", {
        name: "My API",
        identifier: "https://api.example.com",
      });

      await hooks.afterCreate!(
        { tenantId: "main", adapters: mainAdapters },
        resourceServer,
      );

      // Verify it exists on child tenants
      let tenant1RS = await findByIdentifier(
        tenant1Adapters,
        "tenant1",
        "https://api.example.com",
      );
      expect(tenant1RS).toBeDefined();

      // Delete from main (using the resource server's actual id)
      await mainAdapters.resourceServers.remove("main", resourceServer.id);

      // Call the afterDelete hook (with the identifier, as that's what the hook uses to sync)
      await hooks.afterDelete!(
        { tenantId: "main", adapters: mainAdapters },
        resourceServer.identifier,
      );

      // Verify deletion was synced to tenant1
      tenant1RS = await findByIdentifier(
        tenant1Adapters,
        "tenant1",
        "https://api.example.com",
      );
      expect(tenant1RS).toBeNull();

      // Verify deletion was synced to tenant2
      const tenant2RS = await findByIdentifier(
        tenant2Adapters,
        "tenant2",
        "https://api.example.com",
      );
      expect(tenant2RS).toBeNull();
    });

    it("should use shouldSync filter to skip certain resource servers", async () => {
      const hooks = createResourceServerSyncHooks({
        mainTenantId: "main",
        getChildTenantIds: async () => ["tenant1", "tenant2"],
        getAdapters: async (tenantId) => adaptersMap.get(tenantId)!,
        // Only sync resource servers with identifiers starting with "https://api."
        shouldSync: (rs) => rs.identifier.startsWith("https://api."),
      });

      // Create a resource server that should be synced
      const syncedRS = await mainAdapters.resourceServers.create("main", {
        name: "API Server",
        identifier: "https://api.example.com",
      });

      await hooks.afterCreate!(
        { tenantId: "main", adapters: mainAdapters },
        syncedRS,
      );

      // Create a resource server that should NOT be synced
      const notSyncedRS = await mainAdapters.resourceServers.create("main", {
        name: "Internal Server",
        identifier: "https://internal.example.com",
      });

      await hooks.afterCreate!(
        { tenantId: "main", adapters: mainAdapters },
        notSyncedRS,
      );

      // Verify only the API server was synced
      const tenant1ApiRS = await findByIdentifier(
        tenant1Adapters,
        "tenant1",
        "https://api.example.com",
      );
      expect(tenant1ApiRS).toBeDefined();

      const tenant1InternalRS = await findByIdentifier(
        tenant1Adapters,
        "tenant1",
        "https://internal.example.com",
      );
      expect(tenant1InternalRS).toBeNull();
    });

    it("should use transformForSync to modify resource servers before syncing", async () => {
      const hooks = createResourceServerSyncHooks({
        mainTenantId: "main",
        getChildTenantIds: async () => ["tenant1"],
        getAdapters: async (tenantId) => adaptersMap.get(tenantId)!,
        transformForSync: (rs, targetTenantId) => ({
          name: `${rs.name} (${targetTenantId})`,
          identifier: rs.identifier,
          scopes: rs.scopes,
          // Remove sensitive signing data
          signing_secret: undefined,
        }),
      });

      const resourceServer = await mainAdapters.resourceServers.create("main", {
        name: "My API",
        identifier: "https://api.example.com",
        signing_secret: "super-secret-key",
      });

      await hooks.afterCreate!(
        { tenantId: "main", adapters: mainAdapters },
        resourceServer,
      );

      // Verify transform was applied
      const tenant1RS = await findByIdentifier(
        tenant1Adapters,
        "tenant1",
        "https://api.example.com",
      );
      expect(tenant1RS?.name).toBe("My API (tenant1)");
      expect(tenant1RS?.signing_secret).toBeUndefined();
    });

    it("should handle errors gracefully and continue syncing to other tenants", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Create a failing adapters mock
      const failingAdapters = {
        ...tenant1Adapters,
        resourceServers: {
          ...tenant1Adapters.resourceServers,
          create: vi.fn().mockRejectedValue(new Error("Database error")),
        },
      } as unknown as DataAdapters;

      const hooks = createResourceServerSyncHooks({
        mainTenantId: "main",
        getChildTenantIds: async () => ["tenant1", "tenant2"],
        getAdapters: async (tenantId) => {
          if (tenantId === "tenant1") return failingAdapters;
          return adaptersMap.get(tenantId)!;
        },
      });

      const resourceServer = await mainAdapters.resourceServers.create("main", {
        name: "My API",
        identifier: "https://api.example.com",
      });

      // Should not throw even though tenant1 fails
      await hooks.afterCreate!(
        { tenantId: "main", adapters: mainAdapters },
        resourceServer,
      );

      // tenant2 should still have the resource server
      const tenant2RS = await findByIdentifier(
        tenant2Adapters,
        "tenant2",
        "https://api.example.com",
      );
      expect(tenant2RS).toBeDefined();

      // Error should have been logged
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should update existing resource server if it already exists on create", async () => {
      const hooks = createResourceServerSyncHooks({
        mainTenantId: "main",
        getChildTenantIds: async () => ["tenant1"],
        getAdapters: async (tenantId) => adaptersMap.get(tenantId)!,
      });

      // Pre-create resource server on tenant1 with different data
      await tenant1Adapters.resourceServers.create("tenant1", {
        name: "Old Name",
        identifier: "https://api.example.com",
        token_lifetime: 1000,
      });

      // Create on main with new data
      const resourceServer = await mainAdapters.resourceServers.create("main", {
        name: "New Name",
        identifier: "https://api.example.com",
        token_lifetime: 5000,
      });

      await hooks.afterCreate!(
        { tenantId: "main", adapters: mainAdapters },
        resourceServer,
      );

      // Should have updated the existing resource server
      const tenant1RS = await findByIdentifier(
        tenant1Adapters,
        "tenant1",
        "https://api.example.com",
      );
      expect(tenant1RS?.name).toBe("New Name");
      expect(tenant1RS?.token_lifetime).toBe(5000);
    });
  });

  describe("createTenantResourceServerSyncHooks", () => {
    it("should copy all resource servers from main tenant to a newly created tenant", async () => {
      // Create some resource servers on the main tenant
      await mainAdapters.resourceServers.create("main", {
        name: "API Server",
        identifier: "https://api.example.com",
        scopes: [
          { value: "read:data", description: "Read data" },
          { value: "write:data", description: "Write data" },
        ],
        token_lifetime: 3600,
      });

      await mainAdapters.resourceServers.create("main", {
        name: "Internal API",
        identifier: "https://internal.example.com",
        token_lifetime: 7200,
      });

      // Create a new database for the new tenant
      const newTenantDb = new Kysely<Database>({
        dialect: new SqliteDialect({ database: new SQLite(":memory:") }),
      });
      await migrateToLatest(newTenantDb, false);
      const newTenantAdapters = createAdapters(newTenantDb);

      // Create the tenant in its database
      const newTenant = await newTenantAdapters.tenants.create({
        id: "new-tenant",
        friendly_name: "New Tenant",
        audience: "https://new-tenant.example.com",
        sender_email: "admin@new-tenant.example.com",
        sender_name: "New Tenant",
      });

      // Create the tenant hooks
      const tenantHooks = createTenantResourceServerSyncHooks({
        mainTenantId: "main",
        getMainTenantAdapters: async () => mainAdapters,
        getAdapters: async (tenantId) => {
          if (tenantId === "new-tenant") return newTenantAdapters;
          return adaptersMap.get(tenantId)!;
        },
      });

      // Simulate tenant creation callback
      const mockCtx: TenantHookContext = { adapters: newTenantAdapters };
      await tenantHooks.afterCreate!(mockCtx, newTenant);

      // Verify both resource servers were copied to the new tenant
      const newTenantApiRS = await findByIdentifier(
        newTenantAdapters,
        "new-tenant",
        "https://api.example.com",
      );
      expect(newTenantApiRS).toBeDefined();
      expect(newTenantApiRS?.name).toBe("API Server");
      expect(newTenantApiRS?.scopes).toHaveLength(2);
      expect(newTenantApiRS?.token_lifetime).toBe(3600);

      const newTenantInternalRS = await findByIdentifier(
        newTenantAdapters,
        "new-tenant",
        "https://internal.example.com",
      );
      expect(newTenantInternalRS).toBeDefined();
      expect(newTenantInternalRS?.name).toBe("Internal API");
      expect(newTenantInternalRS?.token_lifetime).toBe(7200);
    });

    it("should not copy resource servers when creating the main tenant itself", async () => {
      // Create resource servers on main
      await mainAdapters.resourceServers.create("main", {
        name: "API Server",
        identifier: "https://api.example.com",
      });

      const tenantHooks = createTenantResourceServerSyncHooks({
        mainTenantId: "main",
        getMainTenantAdapters: async () => mainAdapters,
        getAdapters: async (tenantId) => adaptersMap.get(tenantId)!,
      });

      // This should be a no-op (no error, but nothing synced)
      const mockCtx: TenantHookContext = { adapters: mainAdapters };
      await tenantHooks.afterCreate!(mockCtx, { id: "main" });

      // Main tenant should still only have its original resource server
      const mainRS = await mainAdapters.resourceServers.list("main", {});
      expect(mainRS.resource_servers).toHaveLength(1);
    });

    it("should use shouldSync filter when copying resource servers", async () => {
      // Create resource servers on main
      await mainAdapters.resourceServers.create("main", {
        name: "Public API",
        identifier: "https://api.example.com",
      });

      await mainAdapters.resourceServers.create("main", {
        name: "Private API",
        identifier: "https://private.example.com",
      });

      // Create a new database for the new tenant
      const newTenantDb = new Kysely<Database>({
        dialect: new SqliteDialect({ database: new SQLite(":memory:") }),
      });
      await migrateToLatest(newTenantDb, false);
      const newTenantAdapters = createAdapters(newTenantDb);

      const newTenant = await newTenantAdapters.tenants.create({
        id: "new-tenant",
        friendly_name: "New Tenant",
        audience: "https://new-tenant.example.com",
        sender_email: "admin@new-tenant.example.com",
        sender_name: "New Tenant",
      });

      const tenantHooks = createTenantResourceServerSyncHooks({
        mainTenantId: "main",
        getMainTenantAdapters: async () => mainAdapters,
        getAdapters: async () => newTenantAdapters,
        // Only sync public APIs
        shouldSync: (rs) => rs.identifier.startsWith("https://api."),
      });

      const mockCtx: TenantHookContext = { adapters: newTenantAdapters };
      await tenantHooks.afterCreate!(mockCtx, newTenant);

      // Only public API should be synced
      const publicRS = await findByIdentifier(
        newTenantAdapters,
        "new-tenant",
        "https://api.example.com",
      );
      expect(publicRS).toBeDefined();

      const privateRS = await findByIdentifier(
        newTenantAdapters,
        "new-tenant",
        "https://private.example.com",
      );
      expect(privateRS).toBeNull();
    });

    it("should use transformForSync when copying resource servers", async () => {
      await mainAdapters.resourceServers.create("main", {
        name: "My API",
        identifier: "https://api.example.com",
        signing_secret: "super-secret-key",
      });

      // Create a new database for the new tenant
      const newTenantDb = new Kysely<Database>({
        dialect: new SqliteDialect({ database: new SQLite(":memory:") }),
      });
      await migrateToLatest(newTenantDb, false);
      const newTenantAdapters = createAdapters(newTenantDb);

      const newTenant = await newTenantAdapters.tenants.create({
        id: "new-tenant",
        friendly_name: "New Tenant",
        audience: "https://new-tenant.example.com",
        sender_email: "admin@new-tenant.example.com",
        sender_name: "New Tenant",
      });

      const tenantHooks = createTenantResourceServerSyncHooks({
        mainTenantId: "main",
        getMainTenantAdapters: async () => mainAdapters,
        getAdapters: async () => newTenantAdapters,
        transformForSync: (rs, tenantId) => ({
          name: `${rs.name} (${tenantId})`,
          identifier: rs.identifier,
          // Remove sensitive data
          signing_secret: undefined,
        }),
      });

      const mockCtx: TenantHookContext = { adapters: newTenantAdapters };
      await tenantHooks.afterCreate!(mockCtx, newTenant);

      const newRS = await findByIdentifier(
        newTenantAdapters,
        "new-tenant",
        "https://api.example.com",
      );
      expect(newRS?.name).toBe("My API (new-tenant)");
      expect(newRS?.signing_secret).toBeUndefined();
    });

    it("should handle errors gracefully when syncing to new tenant", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await mainAdapters.resourceServers.create("main", {
        name: "API Server",
        identifier: "https://api.example.com",
      });

      // Create a failing adapters mock
      const failingAdapters = {
        resourceServers: {
          create: vi.fn().mockRejectedValue(new Error("Database error")),
        },
      } as unknown as DataAdapters;

      const tenantHooks = createTenantResourceServerSyncHooks({
        mainTenantId: "main",
        getMainTenantAdapters: async () => mainAdapters,
        getAdapters: async () => failingAdapters,
      });

      const mockCtx: TenantHookContext = { adapters: failingAdapters };

      // Should not throw
      await expect(
        tenantHooks.afterCreate!(mockCtx, { id: "new-tenant" }),
      ).resolves.not.toThrow();

      // Error should have been logged
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
