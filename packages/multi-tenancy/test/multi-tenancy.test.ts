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
    Variables: { tenant_id: string };
  }>;
  let db: Kysely<Database>;
  let adapters: ReturnType<typeof createAdapters>;
  let env: { data: ReturnType<typeof createAdapters> };

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
      id: "main",
      friendly_name: "Main Tenant",
      audience: "https://example.com",
      sender_email: "admin@example.com",
      sender_name: "Main Tenant",
    });

    // Setup multi-tenancy with access control for organization creation
    const multiTenancy = setupMultiTenancy({
      accessControl: {
        mainTenantId: "main",
        requireOrganizationMatch: false, // Disable strict organization matching for tests
        defaultPermissions: ["tenant:admin"],
      },
    });

    // Create Hono app with proper typing
    app = new Hono<{
      Bindings: { data: typeof adapters };
      Variables: { tenant_id: string };
    }>();

    // Set tenant_id variable in context
    app.use("*", async (c, next) => {
      c.set("tenant_id", "main");
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

    // Verify organization was created on main tenant
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

    const response = await app.request("/management/tenants", {}, env);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(3); // main + tenant1 + tenant2
    expect(data.map((t: any) => t.id)).toContain("main");
    expect(data.map((t: any) => t.id)).toContain("tenant1");
    expect(data.map((t: any) => t.id)).toContain("tenant2");
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

    // Create organization for the tenant
    await adapters.organizations.create("main", {
      name: "delete-tenant",
      display_name: "Delete Me",
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

    // Verify organization was created on main tenant
    const orgs = await adapters.organizations.list("main");
    const orgTestOrg = orgs.organizations.find(
      (org) => org.name === "org-test",
    );
    expect(orgTestOrg).toBeDefined();
    expect(orgTestOrg?.name).toBe("org-test");
    expect(orgTestOrg?.display_name).toBe("Org Test Corp");
  });

  it("should return 404 for non-existent tenant", async () => {
    const response = await app.request(
      "/management/tenants/non-existent",
      {},
      env,
    );
    expect(response.status).toBe(404);
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
