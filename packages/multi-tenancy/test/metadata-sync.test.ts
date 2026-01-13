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
import { Role, ResourceServer } from "@authhero/adapter-interfaces";

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

describe("Metadata Sync Filter", () => {
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

    // Create env object
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
   */
  function createAppWithSyncHooks() {
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
        resourceServers: true,
        roles: true,
      },
    });

    const multiTenancyConfig: MultiTenancyConfig = {
      accessControl: {
        controlPlaneTenantId,
        requireOrganizationMatch: false,
        defaultPermissions: ["tenant:admin"],
      },
    };

    const multiTenancy = setupMultiTenancy(multiTenancyConfig);

    const combinedHooks: MultiTenancyHooks = {
      ...multiTenancy.hooks,
      tenants: {
        ...multiTenancy.hooks.tenants,
        afterCreate: async (ctx, entity) => {
          if (multiTenancy.hooks.tenants?.afterCreate) {
            await multiTenancy.hooks.tenants.afterCreate(ctx, entity);
          }
          if (syncTenantHooks?.afterCreate) {
            await syncTenantHooks.afterCreate(ctx, entity);
          }
        },
      },
    };

    const app = new Hono<{
      Bindings: { data: typeof adapters };
      Variables: {
        tenant_id: string;
        user?: { sub: string; tenant_id: string };
      };
    }>();

    app.use("*", async (c, next) => {
      c.set("tenant_id", controlPlaneTenantId);
      c.set("user", { sub: testUserId, tenant_id: controlPlaneTenantId });
      await next();
    });

    app.use("*", multiTenancy.middleware);

    const tenantsRouter = createTenantsOpenAPIRouter(
      multiTenancyConfig,
      combinedHooks,
    );
    app.route("/management/tenants", tenantsRouter);

    return app;
  }

  it("should NOT sync resource servers with metadata.sync: false", async () => {
    // Create resource servers on control plane - one should sync, one should not
    await adapters.resourceServers.create(controlPlaneTenantId, {
      name: "Public API",
      identifier: "https://public-api.example.com",
      metadata: { sync: true }, // explicitly set to true
    });

    await adapters.resourceServers.create(controlPlaneTenantId, {
      name: "Internal API",
      identifier: "https://internal-api.example.com",
      metadata: { sync: false }, // should NOT be synced
    });

    await adapters.resourceServers.create(controlPlaneTenantId, {
      name: "Default API",
      identifier: "https://default-api.example.com",
      // no metadata - should be synced by default
    });

    const app = createAppWithSyncHooks();

    // Create a new tenant via the API
    const response = await app.request(
      "/management/tenants",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

    // Public API should be synced (metadata.sync: true)
    const publicApi = await findResourceServerByIdentifier(
      adapters,
      "new-tenant",
      "https://public-api.example.com",
    );
    expect(publicApi).toBeDefined();
    expect(publicApi?.name).toBe("Public API");
    expect(publicApi?.is_system).toBe(true);

    // Internal API should NOT be synced (metadata.sync: false)
    const internalApi = await findResourceServerByIdentifier(
      adapters,
      "new-tenant",
      "https://internal-api.example.com",
    );
    expect(internalApi).toBeNull();

    // Default API should be synced (no metadata)
    const defaultApi = await findResourceServerByIdentifier(
      adapters,
      "new-tenant",
      "https://default-api.example.com",
    );
    expect(defaultApi).toBeDefined();
    expect(defaultApi?.name).toBe("Default API");
    expect(defaultApi?.is_system).toBe(true);
  });

  it("should NOT sync roles with metadata.sync: false", async () => {
    // Create roles on control plane - some should sync, some should not
    await adapters.roles.create(controlPlaneTenantId, {
      name: "Admin",
      description: "Public administrator role",
      metadata: { sync: true }, // explicitly set to true
    });

    await adapters.roles.create(controlPlaneTenantId, {
      name: "Internal-Admin",
      description: "Internal administrator role - control plane only",
      metadata: { sync: false }, // should NOT be synced
    });

    await adapters.roles.create(controlPlaneTenantId, {
      name: "User",
      description: "Regular user role",
      // no metadata - should be synced by default
    });

    const app = createAppWithSyncHooks();

    // Create a new tenant via the API
    const response = await app.request(
      "/management/tenants",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

    // Admin role should be synced (metadata.sync: true)
    const adminRole = await findRoleByName(adapters, "new-tenant", "Admin");
    expect(adminRole).toBeDefined();
    expect(adminRole?.name).toBe("Admin");
    expect(adminRole?.is_system).toBe(true);

    // Internal-Admin role should NOT be synced (metadata.sync: false)
    const internalAdminRole = await findRoleByName(
      adapters,
      "new-tenant",
      "Internal-Admin",
    );
    expect(internalAdminRole).toBeNull();

    // User role should be synced (no metadata)
    const userRole = await findRoleByName(adapters, "new-tenant", "User");
    expect(userRole).toBeDefined();
    expect(userRole?.name).toBe("User");
    expect(userRole?.is_system).toBe(true);
  });

  it("should respect custom filters in addition to metadata.sync filter", async () => {
    // Create resource servers with various metadata
    await adapters.resourceServers.create(controlPlaneTenantId, {
      name: "API v1",
      identifier: "https://api-v1.example.com",
      metadata: { sync: true, version: "v1" },
    });

    await adapters.resourceServers.create(controlPlaneTenantId, {
      name: "API v2",
      identifier: "https://api-v2.example.com",
      metadata: { sync: true, version: "v2" },
    });

    await adapters.resourceServers.create(controlPlaneTenantId, {
      name: "Disabled API",
      identifier: "https://disabled-api.example.com",
      metadata: { sync: false, version: "v1" }, // sync disabled
    });

    // Create sync hooks with a custom filter that only syncs v2 APIs
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
        resourceServers: true,
        roles: true,
      },
      filters: {
        // Custom filter: only sync v2 resource servers
        resourceServers: (entity) => entity.metadata?.version === "v2",
      },
    });

    const multiTenancyConfig: MultiTenancyConfig = {
      accessControl: {
        controlPlaneTenantId,
        requireOrganizationMatch: false,
        defaultPermissions: ["tenant:admin"],
      },
    };

    const multiTenancy = setupMultiTenancy(multiTenancyConfig);

    const combinedHooks: MultiTenancyHooks = {
      ...multiTenancy.hooks,
      tenants: {
        ...multiTenancy.hooks.tenants,
        afterCreate: async (ctx, entity) => {
          if (multiTenancy.hooks.tenants?.afterCreate) {
            await multiTenancy.hooks.tenants.afterCreate(ctx, entity);
          }
          if (syncTenantHooks?.afterCreate) {
            await syncTenantHooks.afterCreate(ctx, entity);
          }
        },
      },
    };

    const app = new Hono<{
      Bindings: { data: typeof adapters };
      Variables: {
        tenant_id: string;
        user?: { sub: string; tenant_id: string };
      };
    }>();

    app.use("*", async (c, next) => {
      c.set("tenant_id", controlPlaneTenantId);
      c.set("user", { sub: testUserId, tenant_id: controlPlaneTenantId });
      await next();
    });
    app.use("*", multiTenancy.middleware);
    app.route(
      "/management/tenants",
      createTenantsOpenAPIRouter(multiTenancyConfig, combinedHooks),
    );

    const response = await app.request(
      "/management/tenants",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "filtered-tenant",
          friendly_name: "Filtered Tenant",
          audience: "https://filtered-tenant.example.com",
          sender_email: "admin@filtered-tenant.example.com",
          sender_name: "Filtered Tenant",
        }),
      },
      env,
    );

    expect(response.status).toBe(201);

    // API v1 should NOT be synced (custom filter rejects v1)
    const apiV1 = await findResourceServerByIdentifier(
      adapters,
      "filtered-tenant",
      "https://api-v1.example.com",
    );
    expect(apiV1).toBeNull();

    // API v2 should be synced (custom filter accepts v2)
    const apiV2 = await findResourceServerByIdentifier(
      adapters,
      "filtered-tenant",
      "https://api-v2.example.com",
    );
    expect(apiV2).toBeDefined();
    expect(apiV2?.name).toBe("API v2");

    // Disabled API should NOT be synced (metadata.sync: false overrides custom filter)
    const disabledApi = await findResourceServerByIdentifier(
      adapters,
      "filtered-tenant",
      "https://disabled-api.example.com",
    );
    expect(disabledApi).toBeNull();
  });

  it("should handle metadata with additional properties alongside sync", async () => {
    // Create role with complex metadata
    await adapters.roles.create(controlPlaneTenantId, {
      name: "Premium-User",
      description: "Premium user role",
      metadata: {
        sync: true,
        tier: "premium",
        features: ["advanced", "analytics"],
        limits: { maxRequests: 10000 },
      },
    });

    const app = createAppWithSyncHooks();

    const response = await app.request(
      "/management/tenants",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "metadata-test-tenant",
          friendly_name: "Metadata Test Tenant",
          audience: "https://metadata-test.example.com",
          sender_email: "admin@metadata-test.example.com",
          sender_name: "Metadata Test",
        }),
      },
      env,
    );

    expect(response.status).toBe(201);

    // Role should be synced since metadata.sync is true
    const premiumRole = await findRoleByName(
      adapters,
      "metadata-test-tenant",
      "Premium-User",
    );
    expect(premiumRole).toBeDefined();
    expect(premiumRole?.is_system).toBe(true);
    // Note: The synced role won't have the same metadata as the original
    // since the sync transform doesn't copy metadata
  });
});
