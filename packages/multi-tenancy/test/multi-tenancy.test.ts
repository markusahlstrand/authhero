import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { Kysely } from "kysely";
import { Database } from "@authhero/kysely-adapter";
import createAdapters, { migrateToLatest } from "@authhero/kysely-adapter";
import { setupMultiTenancy } from "../src/index";

import { createMigratedDb } from "./helpers/migrated-db";
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
    db = await createMigratedDb();

    // Create adapters
    adapters = createAdapters(db);

    // Create env object (simulating Cloudflare Workers environment)
    env = { data: adapters };

    // Create control plane tenant
    await adapters.tenants.create({
      id: "control_plane",
      friendly_name: "Control Plane",
      audience: "https://example.com",
      sender_email: "admin@example.com",
      sender_name: "Control Plane",
    });

    // Create a test user on the control plane
    await adapters.users.create("control_plane", {
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
        controlPlaneTenantId: "control_plane",
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
      c.set("tenant_id", "control_plane");
      c.set("user", { sub: testUserId, tenant_id: "control_plane" });
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
    const orgs = await adapters.organizations.list("control_plane");
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
    await adapters.organizations.create("control_plane", {
      id: "tenant1",
      name: "tenant1",
      display_name: "Tenant 1",
    });
    await adapters.organizations.create("control_plane", {
      id: "tenant2",
      name: "tenant2",
      display_name: "Tenant 2",
    });
    await adapters.userOrganizations.create("control_plane", {
      user_id: testUserId,
      organization_id: "tenant1",
    });
    await adapters.userOrganizations.create("control_plane", {
      user_id: testUserId,
      organization_id: "tenant2",
    });

    const response = await app.request("/management/tenants", {}, env);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data.tenants)).toBe(true);
    expect(data.tenants).toHaveLength(2); // tenant1 + tenant2 (user is not member of control_plane)
    expect(data.tenants.map((t: any) => t.id)).toContain("tenant1");
    expect(data.tenants.map((t: any) => t.id)).toContain("tenant2");
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
    await adapters.organizations.create("control_plane", {
      id: "accessible-tenant",
      name: "accessible-tenant",
      display_name: "Accessible Tenant",
    });
    await adapters.userOrganizations.create("control_plane", {
      user_id: testUserId,
      organization_id: "accessible-tenant",
    });

    // Create organization for inaccessible tenant but don't add user
    await adapters.organizations.create("control_plane", {
      id: "inaccessible-tenant",
      name: "inaccessible-tenant",
      display_name: "Inaccessible Tenant",
    });

    const response = await app.request("/management/tenants", {}, env);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data.tenants)).toBe(true);
    expect(data.tenants).toHaveLength(1); // accessible-tenant only (user is not member of control_plane)
    expect(data.tenants.map((t: any) => t.id)).toContain("accessible-tenant");
    expect(data.tenants.map((t: any) => t.id)).not.toContain("main");
    expect(data.tenants.map((t: any) => t.id)).not.toContain(
      "inaccessible-tenant",
    );
  });

  it("should not bypass org filtering when token is org-scoped, even with admin:organizations", async () => {
    // Regression: an org-scoped token (org_id present) carrying admin:organizations
    // got that permission via an org role, not a global one. It must not see tenants
    // the user has no membership for.
    await adapters.tenants.create({
      id: "user-tenant",
      friendly_name: "User Tenant",
      audience: "https://user.example.com",
      sender_email: "support@user.com",
      sender_name: "User",
    });
    await adapters.tenants.create({
      id: "other-tenant",
      friendly_name: "Other Tenant",
      audience: "https://other.example.com",
      sender_email: "support@other.com",
      sender_name: "Other",
    });

    await adapters.organizations.create("control_plane", {
      id: "user-tenant",
      name: "user-tenant",
      display_name: "User Tenant",
    });
    await adapters.userOrganizations.create("control_plane", {
      user_id: testUserId,
      organization_id: "user-tenant",
    });

    // Build an isolated app where the auth-middleware stand-in injects a token
    // with admin:organizations and an org_id (matching the linkfire-style JWT).
    const orgScopedApp = new Hono<{
      Bindings: { data: typeof adapters };
      Variables: {
        tenant_id: string;
        organization_id?: string;
        user?: {
          sub: string;
          tenant_id: string;
          permissions?: string[];
          org_id?: string;
        };
      };
    }>();

    const multiTenancy = setupMultiTenancy({
      accessControl: {
        controlPlaneTenantId: "control_plane",
        requireOrganizationMatch: false,
        defaultPermissions: ["tenant:admin"],
      },
    });

    orgScopedApp.use("*", async (c, next) => {
      c.set("tenant_id", "control_plane");
      c.set("organization_id", "org_linkfire");
      c.set("user", {
        sub: testUserId,
        tenant_id: "control_plane",
        permissions: ["admin:organizations", "read:tenants"],
        org_id: "org_linkfire",
      });
      await next();
    });
    orgScopedApp.use("*", multiTenancy.middleware);
    orgScopedApp.route("/management", multiTenancy.app);

    const response = await orgScopedApp.request("/management/tenants", {}, env);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data.tenants)).toBe(true);
    const ids = data.tenants.map((t: any) => t.id);
    expect(ids).toContain("user-tenant");
    expect(ids).not.toContain("other-tenant");
    expect(ids).not.toContain("control_plane");
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
    await adapters.organizations.create("control_plane", {
      id: "delete-tenant",
      name: "delete-tenant",
      display_name: "Delete Me",
    });
    await adapters.userOrganizations.create("control_plane", {
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
    const orgs = await adapters.organizations.list("control_plane");
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
    const orgs = await adapters.organizations.list("control_plane");
    const orgTestOrg = orgs.organizations.find(
      (org) => org.name === "org-test",
    );
    expect(orgTestOrg).toBeDefined();
    expect(orgTestOrg?.name).toBe("org-test");
    expect(orgTestOrg?.display_name).toBe("Org Test Corp");
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
