import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import { Database } from "@authhero/kysely-adapter";
import createAdapters, { migrateToLatest } from "@authhero/kysely-adapter";
import { setupMultiTenancy } from "../src/index";

describe("Multi-Tenancy", () => {
  let app: Hono<{
    Bindings: { data: ReturnType<typeof createAdapters> };
    Variables: { tenant_id: string; user?: { sub: string; tenant_id: string } };
  }>;
  let db: Kysely<Database>;
  let adapters: ReturnType<typeof createAdapters>;
  let env: { data: ReturnType<typeof createAdapters> };
  const testUserId = "auth0|test-user-123";

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
      id: "main",
      friendly_name: "Control Plane",
      audience: "https://example.com",
      sender_email: "admin@example.com",
      sender_name: "Control Plane",
    });

    // Create a test user on the control plane
    await adapters.users.create("main", {
      user_id: testUserId,
      email: "test@example.com",
      email_verified: true,
      connection: "Username-Password-Authentication",
      provider: "auth0",
      is_social: false,
      login_count: 0,
    });

    // Setup multi-tenancy with access control for organization creation
    const multiTenancy = setupMultiTenancy({
      accessControl: {
        controlPlaneTenantId: "main",
        requireOrganizationMatch: false, // Disable strict organization matching for tests
        defaultPermissions: ["tenant:admin"],
      },
    });

    // Create Hono app with proper typing
    app = new Hono<{
      Bindings: { data: typeof adapters };
      Variables: {
        tenant_id: string;
        user?: { sub: string; tenant_id: string };
      };
    }>();

    // Set tenant_id and user variables in context (simulating authenticated user)
    app.use("*", async (c, next) => {
      c.set("tenant_id", "main");
      c.set("user", { sub: testUserId, tenant_id: "main" });
      await next();
    });

    // Apply multi-tenancy middleware
    app.use("*", multiTenancy.middleware);

    // Mount tenant management routes
    app.route("/management", multiTenancy.app);

    // Add a simple endpoint to test tenant context
    app.get("/api/tenants/current", (c) => {
      const tenantId = c.get("tenant_id");
      return c.json({ tenant_id: tenantId });
    });
  });

  it("should create a new tenant", async () => {
    const response = await app.request(
      "/management/tenants",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "acme",
          friendly_name: "Acme Corporation",
          audience: "https://acme.example.com",
          sender_email: "support@acme.com",
          sender_name: "Acme Corp",
        }),
      },
      env,
    );

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.id).toBe("acme");
    expect(data.friendly_name).toBe("Acme Corporation");

    // Verify tenant was created in database by listing all tenants
    const allTenants = await adapters.tenants.list({});
    const acmeTenant = allTenants.tenants.find((t) => t.id === "acme");
    expect(acmeTenant).toBeDefined();
    expect(acmeTenant?.friendly_name).toBe("Acme Corporation");

    // Verify organization was created on control plane
    const orgs = await adapters.organizations.list("main");
    const acmeOrg = orgs.organizations.find((org) => org.name === "acme");
    expect(acmeOrg).toBeDefined();
    expect(acmeOrg?.name).toBe("acme");
  });

  it("should list tenants", async () => {
    // Create test tenants
    await adapters.tenants.create({
      id: "tenant1",
      friendly_name: "Tenant 1",
      audience: "https://tenant1.example.com",
      sender_email: "support@tenant1.com",
      sender_name: "Tenant 1",
    });

    await adapters.tenants.create({
      id: "tenant2",
      friendly_name: "Tenant 2",
      audience: "https://tenant2.example.com",
      sender_email: "support@tenant2.com",
      sender_name: "Tenant 2",
    });

    // Create organizations and add user to them
    await adapters.organizations.create("main", {
      id: "tenant1",
      name: "tenant1",
      display_name: "Tenant 1",
    });
    await adapters.organizations.create("main", {
      id: "tenant2",
      name: "tenant2",
      display_name: "Tenant 2",
    });
    await adapters.userOrganizations.create("main", {
      user_id: testUserId,
      organization_id: "tenant1",
    });
    await adapters.userOrganizations.create("main", {
      user_id: testUserId,
      organization_id: "tenant2",
    });

    const response = await app.request("/management/tenants", {}, env);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(3); // main + tenant1 + tenant2
    expect(data.map((t: any) => t.id)).toContain("main");
    expect(data.map((t: any) => t.id)).toContain("tenant1");
    expect(data.map((t: any) => t.id)).toContain("tenant2");
  });

  it("should only list tenants the user has access to", async () => {
    // Create test tenants
    await adapters.tenants.create({
      id: "accessible-tenant",
      friendly_name: "Accessible Tenant",
      audience: "https://accessible.example.com",
      sender_email: "support@accessible.com",
      sender_name: "Accessible",
    });

    await adapters.tenants.create({
      id: "inaccessible-tenant",
      friendly_name: "Inaccessible Tenant",
      audience: "https://inaccessible.example.com",
      sender_email: "support@inaccessible.com",
      sender_name: "Inaccessible",
    });

    // Only create organization and membership for accessible tenant
    await adapters.organizations.create("main", {
      id: "accessible-tenant",
      name: "accessible-tenant",
      display_name: "Accessible Tenant",
    });
    await adapters.userOrganizations.create("main", {
      user_id: testUserId,
      organization_id: "accessible-tenant",
    });

    // Create organization for inaccessible tenant but don't add user
    await adapters.organizations.create("main", {
      id: "inaccessible-tenant",
      name: "inaccessible-tenant",
      display_name: "Inaccessible Tenant",
    });

    const response = await app.request("/management/tenants", {}, env);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(2); // main + accessible-tenant only
    expect(data.map((t: any) => t.id)).toContain("main");
    expect(data.map((t: any) => t.id)).toContain("accessible-tenant");
    expect(data.map((t: any) => t.id)).not.toContain("inaccessible-tenant");
  });

  it("should get a specific tenant", async () => {
    // Create test tenant
    await adapters.tenants.create({
      id: "test-tenant",
      friendly_name: "Test Tenant",
      audience: "https://test.example.com",
      sender_email: "support@test.com",
      sender_name: "Test",
    });

    // Create organization and add user to it
    await adapters.organizations.create("main", {
      id: "test-tenant",
      name: "test-tenant",
      display_name: "Test Tenant",
    });
    await adapters.userOrganizations.create("main", {
      user_id: testUserId,
      organization_id: "test-tenant",
    });

    const response = await app.request(
      "/management/tenants/test-tenant",
      {},
      env,
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.id).toBe("test-tenant");
    expect(data.friendly_name).toBe("Test Tenant");
  });

  it("should update a tenant", async () => {
    // Create test tenant
    await adapters.tenants.create({
      id: "update-tenant",
      friendly_name: "Original Name",
      audience: "https://update.example.com",
      sender_email: "support@update.com",
      sender_name: "Original",
    });

    // Create organization and add user to it
    await adapters.organizations.create("main", {
      id: "update-tenant",
      name: "update-tenant",
      display_name: "Original Name",
    });
    await adapters.userOrganizations.create("main", {
      user_id: testUserId,
      organization_id: "update-tenant",
    });

    const response = await app.request(
      "/management/tenants/update-tenant",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          friendly_name: "Updated Name",
          sender_name: "Updated",
        }),
      },
      env,
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.friendly_name).toBe("Updated Name");
    expect(data.sender_name).toBe("Updated");

    // Verify in database
    const tenant = await adapters.tenants.get("update-tenant");
    expect(tenant?.friendly_name).toBe("Updated Name");
  });

  it("should delete a tenant", async () => {
    // Create test tenant
    await adapters.tenants.create({
      id: "delete-tenant",
      friendly_name: "Delete Me",
      audience: "https://delete.example.com",
      sender_email: "support@delete.com",
      sender_name: "Delete",
    });

    // Create organization for the tenant and add user to it
    await adapters.organizations.create("main", {
      id: "delete-tenant",
      name: "delete-tenant",
      display_name: "Delete Me",
    });
    await adapters.userOrganizations.create("main", {
      user_id: testUserId,
      organization_id: "delete-tenant",
    });

    const response = await app.request(
      "/management/tenants/delete-tenant",
      { method: "DELETE" },
      env,
    );

    expect(response.status).toBe(204);

    // Verify tenant was deleted
    const tenant = await adapters.tenants.get("delete-tenant");
    expect(tenant).toBeNull();

    // Verify organization was deleted
    const orgs = await adapters.organizations.list("main");
    const deletedOrg = orgs.organizations.find(
      (org) => org.name === "delete-tenant",
    );
    expect(deletedOrg).toBeUndefined();
  });

  it("should create organization when tenant is created", async () => {
    const response = await app.request(
      "/management/tenants",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "org-test",
          friendly_name: "Org Test Corp",
          audience: "https://orgtest.example.com",
          sender_email: "support@orgtest.com",
          sender_name: "Org Test",
        }),
      },
      env,
    );

    expect(response.status).toBe(201);

    // Verify organization was created on control plane
    const orgs = await adapters.organizations.list("main");
    const orgTestOrg = orgs.organizations.find(
      (org) => org.name === "org-test",
    );
    expect(orgTestOrg).toBeDefined();
    expect(orgTestOrg?.name).toBe("org-test");
    expect(orgTestOrg?.display_name).toBe("Org Test Corp");
  });

  it("should return 403 for tenant user has no access to", async () => {
    // Create a tenant but don't add user to its organization
    await adapters.tenants.create({
      id: "no-access-tenant",
      friendly_name: "No Access",
      audience: "https://noaccess.example.com",
      sender_email: "support@noaccess.com",
      sender_name: "No Access",
    });

    const response = await app.request(
      "/management/tenants/no-access-tenant",
      {},
      env,
    );
    // Should return 403 because user is not a member of the organization
    expect(response.status).toBe(403);
  });

  it("should validate required fields when creating tenant", async () => {
    const response = await app.request(
      "/management/tenants",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "invalid",
          // Missing required fields
        }),
      },
      env,
    );

    expect(response.status).toBe(400);
  });

  it("should prevent duplicate tenant IDs", async () => {
    // Create first tenant
    await app.request(
      "/management/tenants",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "duplicate",
          friendly_name: "First Tenant",
          audience: "https://first.example.com",
          sender_email: "support@first.com",
          sender_name: "First",
        }),
      },
      env,
    );

    // Try to create tenant with same ID
    const response = await app.request(
      "/management/tenants",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "duplicate",
          friendly_name: "Second Tenant",
          audience: "https://second.example.com",
          sender_email: "support@second.com",
          sender_name: "Second",
        }),
      },
      env,
    );

    expect(response.status).toBe(409);
  });
});
