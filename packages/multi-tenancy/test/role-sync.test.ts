import { describe, it, expect, beforeEach } from "vitest";
import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import { Database } from "@authhero/kysely-adapter";
import createAdapters, { migrateToLatest } from "@authhero/kysely-adapter";
import {
  createRoleSyncHooks,
  createTenantRoleSyncHooks,
} from "../src/hooks/role-sync";
import { Role } from "@authhero/adapter-interfaces";
import { TenantHookContext } from "../src/types";

/**
 * Helper to find a role by name using the list query
 */
async function findByName(
  adapters: ReturnType<typeof createAdapters>,
  tenantId: string,
  name: string,
): Promise<Role | null> {
  const result = await adapters.roles.list(tenantId, {
    q: `name:${name}`,
    per_page: 1,
  });
  return result.roles[0] ?? null;
}

describe("Role Sync Hooks", () => {
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

  describe("createRoleSyncHooks", () => {
    it("should sync a new role from main tenant to all child tenants", async () => {
      const hooks = createRoleSyncHooks({
        mainTenantId: "main",
        getChildTenantIds: async () => ["tenant1", "tenant2"],
        getAdapters: async (tenantId) => adaptersMap.get(tenantId)!,
      });

      // Create a role on the main tenant
      const role = await mainAdapters.roles.create("main", {
        name: "Admin",
        description: "Administrator role",
      });

      // Call the afterCreate hook
      await hooks.afterCreate!(
        { tenantId: "main", adapters: mainAdapters },
        role,
      );

      // Verify role was synced to tenant1
      const tenant1Role = await findByName(tenant1Adapters, "tenant1", "Admin");
      expect(tenant1Role).toBeDefined();
      expect(tenant1Role?.name).toBe("Admin");
      expect(tenant1Role?.description).toBe("Administrator role");
      expect(tenant1Role?.is_system).toBe(true);

      // Verify role was synced to tenant2
      const tenant2Role = await findByName(tenant2Adapters, "tenant2", "Admin");
      expect(tenant2Role).toBeDefined();
      expect(tenant2Role?.name).toBe("Admin");
      expect(tenant2Role?.description).toBe("Administrator role");
    });

    it("should not sync roles created on child tenants", async () => {
      const hooks = createRoleSyncHooks({
        mainTenantId: "main",
        getChildTenantIds: async () => ["tenant1", "tenant2"],
        getAdapters: async (tenantId) => adaptersMap.get(tenantId)!,
      });

      // Create a role on tenant1 (not main)
      const role = await tenant1Adapters.roles.create("tenant1", {
        name: "Tenant1 Admin",
        description: "Tenant 1 specific role",
      });

      // Call the afterCreate hook with tenant1 context
      await hooks.afterCreate!(
        { tenantId: "tenant1", adapters: tenant1Adapters },
        role,
      );

      // Verify role was NOT synced to main or tenant2
      const mainRole = await findByName(mainAdapters, "main", "Tenant1 Admin");
      expect(mainRole).toBeNull();

      const tenant2Role = await findByName(
        tenant2Adapters,
        "tenant2",
        "Tenant1 Admin",
      );
      expect(tenant2Role).toBeNull();
    });

    it("should sync role updates from main tenant", async () => {
      const hooks = createRoleSyncHooks({
        mainTenantId: "main",
        getChildTenantIds: async () => ["tenant1", "tenant2"],
        getAdapters: async (tenantId) => adaptersMap.get(tenantId)!,
      });

      // Create role on main and sync it
      const role = await mainAdapters.roles.create("main", {
        name: "Editor",
        description: "Can edit content",
      });

      await hooks.afterCreate!(
        { tenantId: "main", adapters: mainAdapters },
        role,
      );

      // Update the role on main
      await mainAdapters.roles.update("main", role.id, {
        description: "Can edit and publish content",
      });

      const updatedRole = await mainAdapters.roles.get("main", role.id);
      if (!updatedRole) throw new Error("Role not found");

      // Call afterUpdate hook
      await hooks.afterUpdate!(
        { tenantId: "main", adapters: mainAdapters },
        role.id,
        updatedRole,
      );

      // Verify updates were synced to tenant1
      const tenant1Role = await findByName(tenant1Adapters, "tenant1", "Editor");
      expect(tenant1Role?.description).toBe("Can edit and publish content");

      // Verify updates were synced to tenant2
      const tenant2Role = await findByName(tenant2Adapters, "tenant2", "Editor");
      expect(tenant2Role?.description).toBe("Can edit and publish content");
    });

    it("should use shouldSync filter", async () => {
      const hooks = createRoleSyncHooks({
        mainTenantId: "main",
        getChildTenantIds: async () => ["tenant1"],
        getAdapters: async (tenantId) => adaptersMap.get(tenantId)!,
        shouldSync: (role) => role.name.startsWith("Public"),
      });

      // Create a role that should be synced
      const publicRole = await mainAdapters.roles.create("main", {
        name: "Public User",
        description: "Public user role",
      });

      await hooks.afterCreate!(
        { tenantId: "main", adapters: mainAdapters },
        publicRole,
      );

      // Create a role that should NOT be synced
      const privateRole = await mainAdapters.roles.create("main", {
        name: "Internal Admin",
        description: "Internal admin role",
      });

      await hooks.afterCreate!(
        { tenantId: "main", adapters: mainAdapters },
        privateRole,
      );

      // Verify only the Public User role was synced
      const tenant1PublicRole = await findByName(
        tenant1Adapters,
        "tenant1",
        "Public User",
      );
      expect(tenant1PublicRole).toBeDefined();

      const tenant1InternalRole = await findByName(
        tenant1Adapters,
        "tenant1",
        "Internal Admin",
      );
      expect(tenant1InternalRole).toBeNull();
    });
  });

  describe("createTenantRoleSyncHooks", () => {
    it("should copy all roles from main tenant to a newly created tenant", async () => {
      // Create some roles on the main tenant
      await mainAdapters.roles.create("main", {
        name: "Admin",
        description: "Administrator role",
      });

      await mainAdapters.roles.create("main", {
        name: "User",
        description: "Regular user role",
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
      const tenantHooks = createTenantRoleSyncHooks({
        mainTenantId: "main",
        getMainTenantAdapters: async () => mainAdapters,
        getAdapters: async (tenantId) => {
          if (tenantId === "new-tenant") return newTenantAdapters;
          return adaptersMap.get(tenantId)!;
        },
        syncPermissions: false, // Disable permission sync for this basic test
      });

      // Simulate tenant creation callback
      const mockCtx: TenantHookContext = { adapters: newTenantAdapters };
      await tenantHooks.afterCreate!(mockCtx, newTenant);

      // Verify both roles were copied to the new tenant
      const newTenantAdminRole = await findByName(
        newTenantAdapters,
        "new-tenant",
        "Admin",
      );
      expect(newTenantAdminRole).toBeDefined();
      expect(newTenantAdminRole?.name).toBe("Admin");
      expect(newTenantAdminRole?.description).toBe("Administrator role");
      expect(newTenantAdminRole?.is_system).toBe(true);

      const newTenantUserRole = await findByName(
        newTenantAdapters,
        "new-tenant",
        "User",
      );
      expect(newTenantUserRole).toBeDefined();
      expect(newTenantUserRole?.name).toBe("User");
      expect(newTenantUserRole?.description).toBe("Regular user role");
    });

    it("should not copy roles when creating the main tenant itself", async () => {
      // Create roles on main
      await mainAdapters.roles.create("main", {
        name: "Admin",
        description: "Administrator role",
      });

      const tenantHooks = createTenantRoleSyncHooks({
        mainTenantId: "main",
        getMainTenantAdapters: async () => mainAdapters,
        getAdapters: async (tenantId) => adaptersMap.get(tenantId)!,
      });

      // This should be a no-op (no error, but nothing synced)
      const mockCtx: TenantHookContext = { adapters: mainAdapters };
      await tenantHooks.afterCreate!(mockCtx, { id: "main" });

      // Main tenant should still only have its original role
      const mainRoles = await mainAdapters.roles.list("main", {});
      expect(mainRoles.roles).toHaveLength(1);
    });

    it("should use shouldSync filter when copying roles", async () => {
      // Create roles on main
      await mainAdapters.roles.create("main", {
        name: "Public Admin",
        description: "Public admin role",
      });

      await mainAdapters.roles.create("main", {
        name: "Private Admin",
        description: "Private admin role",
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

      const tenantHooks = createTenantRoleSyncHooks({
        mainTenantId: "main",
        getMainTenantAdapters: async () => mainAdapters,
        getAdapters: async () => newTenantAdapters,
        shouldSync: (role) => role.name.startsWith("Public"),
        syncPermissions: false,
      });

      const mockCtx: TenantHookContext = { adapters: newTenantAdapters };
      await tenantHooks.afterCreate!(mockCtx, newTenant);

      // Verify only the Public Admin was synced
      const publicRole = await findByName(
        newTenantAdapters,
        "new-tenant",
        "Public Admin",
      );
      expect(publicRole).toBeDefined();

      const privateRole = await findByName(
        newTenantAdapters,
        "new-tenant",
        "Private Admin",
      );
      expect(privateRole).toBeNull();
    });

    it("should use transformForSync to modify roles before syncing", async () => {
      // Create a role on main
      await mainAdapters.roles.create("main", {
        name: "Admin",
        description: "Main tenant admin",
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

      const tenantHooks = createTenantRoleSyncHooks({
        mainTenantId: "main",
        getMainTenantAdapters: async () => mainAdapters,
        getAdapters: async () => newTenantAdapters,
        transformForSync: (role, tenantId) => ({
          name: role.name,
          description: `${role.description} (synced to ${tenantId})`,
        }),
        syncPermissions: false,
      });

      const mockCtx: TenantHookContext = { adapters: newTenantAdapters };
      await tenantHooks.afterCreate!(mockCtx, newTenant);

      const newRole = await findByName(
        newTenantAdapters,
        "new-tenant",
        "Admin",
      );
      expect(newRole?.description).toBe(
        "Main tenant admin (synced to new-tenant)",
      );
    });

    it("should sync role permissions when syncPermissions is enabled", async () => {
      // Create a resource server on main with scopes
      await mainAdapters.resourceServers.create("main", {
        name: "API Server",
        identifier: "https://api.example.com",
        scopes: [
          { value: "read:data", description: "Read data" },
          { value: "write:data", description: "Write data" },
        ],
      });

      // Create a role with permissions
      const adminRole = await mainAdapters.roles.create("main", {
        name: "Admin",
        description: "Administrator",
      });

      // Assign permissions to the role
      await mainAdapters.rolePermissions.assign("main", adminRole.id, [
        {
          role_id: adminRole.id,
          resource_server_identifier: "https://api.example.com",
          permission_name: "read:data",
        },
        {
          role_id: adminRole.id,
          resource_server_identifier: "https://api.example.com",
          permission_name: "write:data",
        },
      ]);

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

      // Also need to create the resource server on the new tenant for permissions to work
      await newTenantAdapters.resourceServers.create("new-tenant", {
        name: "API Server",
        identifier: "https://api.example.com",
        scopes: [
          { value: "read:data", description: "Read data" },
          { value: "write:data", description: "Write data" },
        ],
      });

      const tenantHooks = createTenantRoleSyncHooks({
        mainTenantId: "main",
        getMainTenantAdapters: async () => mainAdapters,
        getAdapters: async () => newTenantAdapters,
        syncPermissions: true, // Enable permission sync
      });

      const mockCtx: TenantHookContext = { adapters: newTenantAdapters };
      await tenantHooks.afterCreate!(mockCtx, newTenant);

      // Verify role was synced
      const newRole = await findByName(
        newTenantAdapters,
        "new-tenant",
        "Admin",
      );
      expect(newRole).toBeDefined();

      // Verify permissions were synced
      if (newRole) {
        const permissions = await newTenantAdapters.rolePermissions.list(
          "new-tenant",
          newRole.id,
        );
        expect(permissions).toHaveLength(2);
        expect(permissions.map((p) => p.permission_name)).toContain("read:data");
        expect(permissions.map((p) => p.permission_name)).toContain(
          "write:data",
        );
      }
    });
  });
});
