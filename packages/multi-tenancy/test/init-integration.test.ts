import { describe, it, expect, beforeEach } from "vitest";
import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import { Hono } from "hono";
import { Database } from "@authhero/kysely-adapter";
import createAdapters, { migrateToLatest } from "@authhero/kysely-adapter";
import {
  setupMultiTenancy,
  createSyncHooks,
  createTenantsOpenAPIRouter,
  MultiTenancyConfig,
  MultiTenancyHooks,
} from "../src/index";
import { Role, ResourceServer, DataAdapters } from "@authhero/adapter-interfaces";
import { EntityHookContext } from "authhero";

/**
 * Helper to find a resource server by identifier using the list query
 */
async function findResourceServerByIdentifier(
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

/**
 * Helper to find a role by name using the list query
 */
async function findRoleByName(
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

describe("Tenant Sync Hooks Integration", () => {
  let db: Kysely<Database>;
  let adapters: ReturnType<typeof createAdapters>;
  let env: { data: ReturnType<typeof createAdapters> };
  const testUserId = "auth0|test-user-123";
  const controlPlaneTenantId = "control_plane";

  beforeEach(async () => {
    // Create in-memory SQLite database
    const dialect = new SqliteDialect({
      database: new SQLite(":memory:"),
    });
    db = new Kysely<Database>({ dialect });

    // Run migrations
    await migrateToLatest(db, false);

    // Create adapters
    adapters = createAdapters(db);

    // Create env object (simulating Cloudflare Workers environment)
    env = { data: adapters };

    // Create control plane tenant
    await adapters.tenants.create({
      id: controlPlaneTenantId,
      friendly_name: "Control Plane",
      audience: "https://example.com",
      sender_email: "admin@example.com",
      sender_name: "Control Plane",
    });

    // Create a test user on the control plane
    await adapters.users.create(controlPlaneTenantId, {
      user_id: testUserId,
      email: "test@example.com",
      email_verified: true,
      connection: "Username-Password-Authentication",
      provider: "auth0",
      is_social: false,
      login_count: 0,
    });
  });

  /**
   * Helper to create a Hono app with multi-tenancy and sync hooks.
   * This simulates what init() does but in a more testable way.
   */
  function createAppWithSyncHooks(options: {
    syncResourceServers?: boolean;
    syncRoles?: boolean;
    syncConnections?: boolean;
  }) {
    const {
      syncResourceServers = true,
      syncRoles = true,
      syncConnections = true,
    } = options;

    // Create the unified sync hooks
    const { tenantHooks: syncTenantHooks } = createSyncHooks({
      controlPlaneTenantId,
      getControlPlaneAdapters: async () => adapters,
      getAdapters: async (_tenantId: string) => adapters,
      getChildTenantIds: async () => {
        const allTenants = await adapters.tenants.list();
        return allTenants.tenants
          .map((t) => t.id)
          .filter((id) => id !== controlPlaneTenantId);
      },
      sync: {
        resourceServers: syncResourceServers,
        roles: syncRoles,
        connections: syncConnections,
      },
    });

    // Setup base multi-tenancy
    const multiTenancyConfig: MultiTenancyConfig = {
      accessControl: {
        controlPlaneTenantId,
        requireOrganizationMatch: false,
        defaultPermissions: ["tenant:admin"],
      },
    };

    const multiTenancy = setupMultiTenancy(multiTenancyConfig);

    // Create combined tenant hooks that include sync hooks
    const combinedHooks: MultiTenancyHooks = {
      ...multiTenancy.hooks,
      tenants: {
        ...multiTenancy.hooks.tenants,
        afterCreate: async (ctx, entity) => {
          // First run base provisioning hooks
          if (multiTenancy.hooks.tenants?.afterCreate) {
            await multiTenancy.hooks.tenants.afterCreate(ctx, entity);
          }
          // Then run sync hooks
          if (syncTenantHooks?.afterCreate) {
            await syncTenantHooks.afterCreate(ctx, entity);
          }
        },
      },
    };

    // Create Hono app
    const app = new Hono<{
      Bindings: { data: typeof adapters };
      Variables: {
        tenant_id: string;
        user?: { sub: string; tenant_id: string };
      };
    }>();

    // Set tenant_id and user variables in context (simulating authenticated user)
    app.use("*", async (c, next) => {
      c.set("tenant_id", controlPlaneTenantId);
      c.set("user", { sub: testUserId, tenant_id: controlPlaneTenantId });
      await next();
    });

    // Apply multi-tenancy middleware
    app.use("*", multiTenancy.middleware);

    // Create router for tenant routes with combined hooks
    const tenantsRouter = createTenantsOpenAPIRouter(
      multiTenancyConfig,
      combinedHooks,
    );
    app.route("/management/tenants", tenantsRouter);

    return app;
  }

  it("should sync resource servers and roles when creating a new tenant", async () => {
    // Create resource servers on control plane
    await adapters.resourceServers.create(controlPlaneTenantId, {
      name: "API Server",
      identifier: "https://api.example.com",
      scopes: [
        { value: "read:data", description: "Read data" },
        { value: "write:data", description: "Write data" },
      ],
    });

    await adapters.resourceServers.create(controlPlaneTenantId, {
      name: "Auth Server",
      identifier: "https://auth.example.com",
    });

    // Create roles on control plane
    await adapters.roles.create(controlPlaneTenantId, {
      name: "Admin",
      description: "Administrator role",
    });

    await adapters.roles.create(controlPlaneTenantId, {
      name: "User",
      description: "Regular user role",
    });

    // Create app with sync enabled
    const app = createAppWithSyncHooks({
      syncResourceServers: true,
      syncRoles: true,
    });

    // Create a new tenant via the API
    const response = await app.request(
      "/management/tenants",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "new-tenant",
          friendly_name: "New Tenant",
          audience: "https://new-tenant.example.com",
          sender_email: "admin@new-tenant.example.com",
          sender_name: "New Tenant",
        }),
      },
      env,
    );

    expect(response.status).toBe(201);
    const tenant = await response.json();
    expect(tenant.id).toBe("new-tenant");

    // Verify resource servers were synced to the new tenant
    const apiServer = await findResourceServerByIdentifier(
      adapters,
      "new-tenant",
      "https://api.example.com",
    );
    expect(apiServer).toBeDefined();
    expect(apiServer?.name).toBe("API Server");
    expect(apiServer?.is_system).toBe(true);
    expect(apiServer?.scopes).toHaveLength(2);

    const authServer = await findResourceServerByIdentifier(
      adapters,
      "new-tenant",
      "https://auth.example.com",
    );
    expect(authServer).toBeDefined();
    expect(authServer?.name).toBe("Auth Server");
    expect(authServer?.is_system).toBe(true);

    // Verify roles were synced to the new tenant
    const adminRole = await findRoleByName(adapters, "new-tenant", "Admin");
    expect(adminRole).toBeDefined();
    expect(adminRole?.name).toBe("Admin");
    expect(adminRole?.description).toBe("Administrator role");
    expect(adminRole?.is_system).toBe(true);

    const userRole = await findRoleByName(adapters, "new-tenant", "User");
    expect(userRole).toBeDefined();
    expect(userRole?.name).toBe("User");
    expect(userRole?.description).toBe("Regular user role");
    expect(userRole?.is_system).toBe(true);
  });

  it("should not sync when sync is disabled", async () => {
    // Create resource servers on control plane
    await adapters.resourceServers.create(controlPlaneTenantId, {
      name: "API Server",
      identifier: "https://api.example.com",
    });

    // Create roles on control plane
    await adapters.roles.create(controlPlaneTenantId, {
      name: "Admin",
      description: "Administrator role",
    });

    // Create app with sync DISABLED
    const app = createAppWithSyncHooks({
      syncResourceServers: false,
      syncRoles: false,
    });

    // Create a new tenant via the API
    const response = await app.request(
      "/management/tenants",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "new-tenant",
          friendly_name: "New Tenant",
          audience: "https://new-tenant.example.com",
          sender_email: "admin@new-tenant.example.com",
          sender_name: "New Tenant",
        }),
      },
      env,
    );

    expect(response.status).toBe(201);

    // Verify resource servers were NOT synced
    const apiServer = await findResourceServerByIdentifier(
      adapters,
      "new-tenant",
      "https://api.example.com",
    );
    expect(apiServer).toBeNull();

    // Verify roles were NOT synced
    const adminRole = await findRoleByName(adapters, "new-tenant", "Admin");
    expect(adminRole).toBeNull();
  });

  it("should sync role permissions when creating a new tenant", async () => {
    // Create a resource server with scopes on control plane
    await adapters.resourceServers.create(controlPlaneTenantId, {
      name: "API Server",
      identifier: "https://api.example.com",
      scopes: [
        { value: "read:data", description: "Read data" },
        { value: "write:data", description: "Write data" },
      ],
    });

    // Create a role with permissions on control plane
    const adminRole = await adapters.roles.create(controlPlaneTenantId, {
      name: "Admin",
      description: "Administrator role",
    });

    // Assign permissions to the role
    await adapters.rolePermissions.assign(controlPlaneTenantId, adminRole.id, [
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

    // Create app with sync enabled including permissions
    const app = createAppWithSyncHooks({
      syncResourceServers: true,
      syncRoles: true,
    });

    // Create a new tenant via the API
    const response = await app.request(
      "/management/tenants",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "new-tenant",
          friendly_name: "New Tenant",
          audience: "https://new-tenant.example.com",
          sender_email: "admin@new-tenant.example.com",
          sender_name: "New Tenant",
        }),
      },
      env,
    );

    expect(response.status).toBe(201);

    // Verify the role was synced
    const newAdminRole = await findRoleByName(adapters, "new-tenant", "Admin");
    expect(newAdminRole).toBeDefined();
    expect(newAdminRole?.id).toBeDefined();

    // Verify permissions were synced
    // Note: rolePermissions.list returns an array directly
    const permissions = await adapters.rolePermissions.list(
      "new-tenant",
      newAdminRole!.id,
      {},
    );
    expect(permissions).toHaveLength(2);

    const permissionNames = permissions.map((p) => p.permission_name);
    expect(permissionNames).toContain("read:data");
    expect(permissionNames).toContain("write:data");
  });

  it("should create role on child tenant when updating role on control plane that doesn't exist on child", async () => {
    // First, create a child tenant (without any synced roles initially)
    await adapters.tenants.create({
      id: "existing-tenant",
      friendly_name: "Existing Tenant",
      audience: "https://existing-tenant.example.com",
      sender_email: "admin@existing-tenant.example.com",
      sender_name: "Existing Tenant",
    });

    // Verify no role exists on child tenant yet
    const beforeRole = await findRoleByName(
      adapters,
      "existing-tenant",
      "NewRole",
    );
    expect(beforeRole).toBeNull();

    // Create the sync hooks
    const { entityHooks } = createSyncHooks({
      controlPlaneTenantId,
      getControlPlaneAdapters: async () => adapters,
      getAdapters: async (_tenantId: string) => adapters,
      getChildTenantIds: async () => {
        const allTenants = await adapters.tenants.list({});
        return allTenants.tenants
          .map((t) => t.id)
          .filter((id) => id !== controlPlaneTenantId);
      },
      sync: {
        resourceServers: true,
        roles: true,
        connections: true,
      },
    });

    // Create a role on the control plane (simulating that it was created after the child tenant)
    const newRole = await adapters.roles.create(controlPlaneTenantId, {
      name: "NewRole",
      description: "A new role created after child tenant existed",
    });

    // Create a mock EntityHookContext
    const mockCtx: EntityHookContext = {
      tenantId: controlPlaneTenantId,
      adapters: adapters as unknown as DataAdapters,
    };

    // Simulate an update to this role on the control plane
    // The sync hook should create the role on the child tenant since it doesn't exist
    await entityHooks.roles.afterUpdate?.(mockCtx, newRole.id, newRole);

    // Verify the role was created on the child tenant
    const afterRole = await findRoleByName(
      adapters,
      "existing-tenant",
      "NewRole",
    );
    expect(afterRole).toBeDefined();
    expect(afterRole?.name).toBe("NewRole");
    expect(afterRole?.description).toBe(
      "A new role created after child tenant existed",
    );
    expect(afterRole?.is_system).toBe(true);
  });

  it("should update existing role on child tenant when updating role on control plane", async () => {
    // First, create a child tenant
    await adapters.tenants.create({
      id: "existing-tenant",
      friendly_name: "Existing Tenant",
      audience: "https://existing-tenant.example.com",
      sender_email: "admin@existing-tenant.example.com",
      sender_name: "Existing Tenant",
    });

    // Create a role on both control plane and child tenant
    const controlPlaneRole = await adapters.roles.create(controlPlaneTenantId, {
      name: "ExistingRole",
      description: "Original description",
    });

    await adapters.roles.create("existing-tenant", {
      name: "ExistingRole",
      description: "Child tenant description",
      is_system: true,
    });

    // Create the sync hooks
    const { entityHooks } = createSyncHooks({
      controlPlaneTenantId,
      getControlPlaneAdapters: async () => adapters,
      getAdapters: async (_tenantId: string) => adapters,
      getChildTenantIds: async () => {
        const allTenants = await adapters.tenants.list({});
        return allTenants.tenants
          .map((t) => t.id)
          .filter((id) => id !== controlPlaneTenantId);
      },
      sync: {
        resourceServers: true,
        roles: true,
        connections: true,
      },
    });

    // Update the role on control plane
    await adapters.roles.update(controlPlaneTenantId, controlPlaneRole.id, {
      description: "Updated description from control plane",
    });

    // Get the updated role
    const updatedControlPlaneRole = await adapters.roles.get(
      controlPlaneTenantId,
      controlPlaneRole.id,
    );

    // Create a mock EntityHookContext
    const mockCtx: EntityHookContext = {
      tenantId: controlPlaneTenantId,
      adapters: adapters as unknown as DataAdapters,
    };

    // Trigger the afterUpdate hook
    await entityHooks.roles.afterUpdate?.(
      mockCtx,
      controlPlaneRole.id,
      updatedControlPlaneRole!,
    );

    // Verify the role was updated on the child tenant
    const childRole = await findRoleByName(
      adapters,
      "existing-tenant",
      "ExistingRole",
    );
    expect(childRole).toBeDefined();
    expect(childRole?.description).toBe("Updated description from control plane");
    expect(childRole?.is_system).toBe(true);
  });
});

describe("initMultiTenant", () => {
  let db: Kysely<Database>;
  let adapters: ReturnType<typeof createAdapters>;
  const controlPlaneTenantId = "control_plane";

  beforeEach(async () => {
    const dialect = new SqliteDialect({
      database: new SQLite(":memory:"),
    });
    db = new Kysely<Database>({ dialect });
    await migrateToLatest(db, false);
    adapters = createAdapters(db);

    // Create control plane tenant
    await adapters.tenants.create({
      id: controlPlaneTenantId,
      friendly_name: "Control Plane",
      audience: "https://example.com",
      sender_email: "admin@example.com",
      sender_name: "Control Plane",
    });
  });

  it("should create an app with default settings", async () => {
    const { initMultiTenant } = await import("../src/init");

    const { app, controlPlaneTenantId: cpId } = initMultiTenant({
      dataAdapter: adapters,
    });

    expect(app).toBeDefined();
    expect(cpId).toBe("control_plane");
  });

  it("should create an app with custom control plane tenant ID", async () => {
    const { initMultiTenant } = await import("../src/init");

    const { controlPlaneTenantId: cpId } = initMultiTenant({
      dataAdapter: adapters,
      controlPlane: {
        tenantId: "main",
        clientId: "main_client",
      },
    });

    expect(cpId).toBe("main");
  });

  it("should disable sync when sync is false", async () => {
    const { initMultiTenant } = await import("../src/init");

    // Should not throw
    const { app } = initMultiTenant({
      dataAdapter: adapters,
      sync: false,
    });

    expect(app).toBeDefined();
  });
});
