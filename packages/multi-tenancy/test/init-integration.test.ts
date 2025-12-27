import { describe, it, expect, beforeEach } from "vitest";
import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import { Hono } from "hono";
import { Database } from "@authhero/kysely-adapter";
import createAdapters, { migrateToLatest } from "@authhero/kysely-adapter";
import {
  setupMultiTenancy,
  createTenantResourceServerSyncHooks,
  createTenantRoleSyncHooks,
  createTenantsRouter,
  MultiTenancyConfig,
  MultiTenancyHooks,
} from "../src/index";
import { Role, ResourceServer, Tenant } from "@authhero/adapter-interfaces";

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
  const mainTenantId = "main";

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

    // Create main tenant
    await adapters.tenants.create({
      id: mainTenantId,
      friendly_name: "Main Tenant",
      audience: "https://example.com",
      sender_email: "admin@example.com",
      sender_name: "Main Tenant",
    });

    // Create a test user on the main tenant
    await adapters.users.create(mainTenantId, {
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
    syncPermissions?: boolean;
  }) {
    const { syncResourceServers = true, syncRoles = true, syncPermissions = true } = options;

    // Create the sync hooks
    const tenantResourceServerHooks = syncResourceServers
      ? createTenantResourceServerSyncHooks({
          mainTenantId,
          getMainTenantAdapters: async () => adapters,
          getAdapters: async (_tenantId: string) => adapters,
        })
      : undefined;

    const tenantRoleHooks = syncRoles
      ? createTenantRoleSyncHooks({
          mainTenantId,
          getMainTenantAdapters: async () => adapters,
          getAdapters: async (_tenantId: string) => adapters,
          syncPermissions,
        })
      : undefined;

    // Setup base multi-tenancy
    const multiTenancyConfig: MultiTenancyConfig = {
      accessControl: {
        mainTenantId,
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
          if (tenantResourceServerHooks?.afterCreate) {
            await tenantResourceServerHooks.afterCreate(ctx, entity);
          }
          if (tenantRoleHooks?.afterCreate) {
            await tenantRoleHooks.afterCreate(ctx, entity);
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
      c.set("tenant_id", mainTenantId);
      c.set("user", { sub: testUserId, tenant_id: mainTenantId });
      await next();
    });

    // Apply multi-tenancy middleware
    app.use("*", multiTenancy.middleware);

    // Create router for tenant routes with combined hooks
    const tenantsRouter = createTenantsRouter(multiTenancyConfig, combinedHooks);
    app.route("/management/tenants", tenantsRouter);

    return app;
  }

  it("should sync resource servers and roles when creating a new tenant", async () => {
    // Create resource servers on main tenant
    await adapters.resourceServers.create(mainTenantId, {
      name: "API Server",
      identifier: "https://api.example.com",
      scopes: [
        { value: "read:data", description: "Read data" },
        { value: "write:data", description: "Write data" },
      ],
    });

    await adapters.resourceServers.create(mainTenantId, {
      name: "Auth Server",
      identifier: "https://auth.example.com",
    });

    // Create roles on main tenant
    await adapters.roles.create(mainTenantId, {
      name: "Admin",
      description: "Administrator role",
    });

    await adapters.roles.create(mainTenantId, {
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
    // Create resource servers on main tenant
    await adapters.resourceServers.create(mainTenantId, {
      name: "API Server",
      identifier: "https://api.example.com",
    });

    // Create roles on main tenant
    await adapters.roles.create(mainTenantId, {
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
    // Create a resource server with scopes on main tenant
    await adapters.resourceServers.create(mainTenantId, {
      name: "API Server",
      identifier: "https://api.example.com",
      scopes: [
        { value: "read:data", description: "Read data" },
        { value: "write:data", description: "Write data" },
      ],
    });

    // Create a role with permissions on main tenant
    const adminRole = await adapters.roles.create(mainTenantId, {
      name: "Admin",
      description: "Administrator role",
    });

    // Assign permissions to the role
    await adapters.rolePermissions.assign(mainTenantId, adminRole.id, [
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
      syncPermissions: true,
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
});
