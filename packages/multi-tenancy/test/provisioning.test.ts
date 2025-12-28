import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import { Database } from "@authhero/kysely-adapter";
import createAdapters, { migrateToLatest } from "@authhero/kysely-adapter";
import { setupMultiTenancy, MANAGEMENT_API_SCOPES } from "../src/index";

describe("Tenant Provisioning with User Organization Membership", () => {
  let app: Hono<{
    Bindings: { data: ReturnType<typeof createAdapters> };
    Variables: { tenant_id: string; user?: { sub: string; tenant_id: string } };
  }>;
  let db: Kysely<Database>;
  let adapters: ReturnType<typeof createAdapters>;
  let env: { data: ReturnType<typeof createAdapters> };

  const TEST_ISSUER = "https://auth.example.com/";
  const MANAGEMENT_API_IDENTIFIER = `${TEST_ISSUER}api/v2/`;
  const TEST_USER_ID = "auth0|user123";

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
      id: "control_plane",
      friendly_name: "Control Plane",
      audience: "https://example.com",
      sender_email: "admin@example.com",
      sender_name: "Control Plane",
    });

    // Create the Management API resource server on the control plane
    await adapters.resourceServers.create("control_plane", {
      name: "Authhero Management API",
      identifier: "urn:authhero:management",
      allow_offline_access: false,
      skip_consent_for_verifiable_first_party_clients: false,
      token_lifetime: 86400,
      token_lifetime_for_web: 7200,
      signing_alg: "RS256",
      scopes: MANAGEMENT_API_SCOPES,
    });

    // Create a test user on the control plane
    await adapters.users.create("control_plane", {
      user_id: TEST_USER_ID,
      email: "testuser@example.com",
      email_verified: true,
      connection: "Username-Password-Authentication",
      provider: "auth2",
    });

    // Setup multi-tenancy with access control and issuer for admin role creation
    const multiTenancy = setupMultiTenancy({
      accessControl: {
        controlPlaneTenantId: "control_plane",
        requireOrganizationMatch: false,
        issuer: TEST_ISSUER,
        adminRoleName: "Tenant Admin",
        adminRoleDescription: "Full access to all tenant management operations",
        addCreatorToOrganization: true,
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
      // Simulate an authenticated user
      c.set("user", {
        sub: TEST_USER_ID,
        tenant_id: "control_plane",
      });
      await next();
    });

    // Apply multi-tenancy middleware
    app.use("*", multiTenancy.middleware);

    // Mount tenant management routes
    app.route("/management", multiTenancy.app);
  });

  it("should add the creator user to the organization when creating a tenant", async () => {
    // Create a new tenant
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
          sender_email: "support@new-tenant.com",
          sender_name: "New Tenant",
        }),
      },
      env,
    );

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.id).toBe("new-tenant");

    // Verify organization was created on control plane
    const orgs = await adapters.organizations.list("control_plane");
    const newTenantOrg = orgs.organizations.find(
      (org) => org.name === "new-tenant",
    );
    expect(newTenantOrg).toBeDefined();
    expect(newTenantOrg?.display_name).toBe("New Tenant");

    // Verify the creator user was added to the organization
    const userOrgs = await adapters.userOrganizations.list("control_plane", {
      q: `organization_id:${newTenantOrg!.id}`,
    });
    const userOrgMembership = userOrgs.userOrganizations.find(
      (uo) => uo.user_id === TEST_USER_ID,
    );
    expect(userOrgMembership).toBeDefined();
    expect(userOrgMembership?.user_id).toBe(TEST_USER_ID);
    expect(userOrgMembership?.organization_id).toBe(newTenantOrg!.id);
  });

  it("should create the Tenant Admin role with Management API permissions", async () => {
    // Create a new tenant
    const response = await app.request(
      "/management/tenants",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "admin-role-test",
          friendly_name: "Admin Role Test",
          audience: "https://admin-test.example.com",
          sender_email: "support@admin-test.com",
          sender_name: "Admin Test",
        }),
      },
      env,
    );

    expect(response.status).toBe(201);

    // Verify the Tenant Admin role was created on control plane
    const roles = await adapters.roles.list("control_plane", {});
    const adminRole = roles.roles.find((r) => r.name === "Tenant Admin");
    expect(adminRole).toBeDefined();
    expect(adminRole?.description).toBe(
      "Full access to all tenant management operations",
    );

    // Verify the role has Management API permissions
    const rolePermissions = await adapters.rolePermissions.list(
      "control_plane",
      adminRole!.id,
    );
    expect(rolePermissions.length).toBeGreaterThan(0);

    // Check that some key permissions are assigned
    const permissionNames = rolePermissions.map((p) => p.permission_name);
    expect(permissionNames).toContain("read:users");
    expect(permissionNames).toContain("create:users");
    expect(permissionNames).toContain("read:clients");
    expect(permissionNames).toContain("create:clients");
    expect(permissionNames).toContain("read:connections");
    expect(permissionNames).toContain("read:resource_servers");

    // Verify permissions are for the Management API
    const allPermissionsForManagementApi = rolePermissions.every(
      (p) => p.resource_server_identifier === "urn:authhero:management",
    );
    expect(allPermissionsForManagementApi).toBe(true);
  });

  it("should assign the admin role to the creator user for the organization", async () => {
    // Create a new tenant
    const response = await app.request(
      "/management/tenants",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "role-assignment-test",
          friendly_name: "Role Assignment Test",
          audience: "https://role-test.example.com",
          sender_email: "support@role-test.com",
          sender_name: "Role Test",
        }),
      },
      env,
    );

    expect(response.status).toBe(201);

    // Get the organization that was created
    const orgs = await adapters.organizations.list("control_plane");
    const testOrg = orgs.organizations.find(
      (org) => org.name === "role-assignment-test",
    );
    expect(testOrg).toBeDefined();

    // Get the admin role
    const roles = await adapters.roles.list("control_plane", {});
    const adminRole = roles.roles.find((r) => r.name === "Tenant Admin");
    expect(adminRole).toBeDefined();

    // Verify the user has the admin role for this organization
    const userRoles = await adapters.userRoles.list(
      "control_plane",
      TEST_USER_ID,
      {},
      testOrg!.id,
    );
    const hasAdminRole = userRoles.some((r) => r.id === adminRole!.id);
    expect(hasAdminRole).toBe(true);
  });

  it("should reuse existing admin role when creating multiple tenants", async () => {
    // Create first tenant
    const response1 = await app.request(
      "/management/tenants",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "tenant-one",
          friendly_name: "Tenant One",
          audience: "https://tenant-one.example.com",
          sender_email: "support@tenant-one.com",
          sender_name: "Tenant One",
        }),
      },
      env,
    );
    expect(response1.status).toBe(201);

    // Create second tenant with different ID
    const response2 = await app.request(
      "/management/tenants",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "tenant-two",
          friendly_name: "Tenant Two",
          audience: "https://tenant-two.example.com",
          sender_email: "support@tenant-two.com",
          sender_name: "Tenant Two",
        }),
      },
      env,
    );
    expect(response2.status).toBe(201);

    // Verify only one Tenant Admin role exists
    const roles = await adapters.roles.list("control_plane", {});
    const adminRoles = roles.roles.filter((r) => r.name === "Tenant Admin");
    expect(adminRoles).toHaveLength(1);

    // Verify user is a member of both organizations
    const userOrgs = await adapters.userOrganizations.listUserOrganizations(
      "control_plane",
      TEST_USER_ID,
    );
    const orgNames = userOrgs.organizations.map((o) => o.name);
    expect(orgNames).toContain("tenant-one");
    expect(orgNames).toContain("tenant-two");

    // Verify user has the admin role in both organizations
    const orgs = await adapters.organizations.list("control_plane");
    const tenantOneOrg = orgs.organizations.find(
      (o) => o.name === "tenant-one",
    );
    const tenantTwoOrg = orgs.organizations.find(
      (o) => o.name === "tenant-two",
    );

    const adminRole = adminRoles[0]!;

    const rolesInTenantOne = await adapters.userRoles.list(
      "control_plane",
      TEST_USER_ID,
      {},
      tenantOneOrg!.id,
    );
    expect(rolesInTenantOne.some((r) => r.id === adminRole.id)).toBe(true);

    const rolesInTenantTwo = await adapters.userRoles.list(
      "control_plane",
      TEST_USER_ID,
      {},
      tenantTwoOrg!.id,
    );
    expect(rolesInTenantTwo.some((r) => r.id === adminRole.id)).toBe(true);
  });

  it("should create organization with tenant display name", async () => {
    const response = await app.request(
      "/management/tenants",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "display-name-test",
          friendly_name: "My Awesome Company",
          audience: "https://awesome.example.com",
          sender_email: "support@awesome.com",
          sender_name: "Awesome Co",
        }),
      },
      env,
    );

    expect(response.status).toBe(201);

    // Verify organization has the tenant's friendly_name as display_name
    const orgs = await adapters.organizations.list("control_plane");
    const org = orgs.organizations.find(
      (org) => org.name === "display-name-test",
    );
    expect(org).toBeDefined();
    expect(org?.name).toBe("display-name-test");
    expect(org?.display_name).toBe("My Awesome Company");
  });
});

describe("Tenant Provisioning without issuer (no admin role)", () => {
  let app: Hono<{
    Bindings: { data: ReturnType<typeof createAdapters> };
    Variables: { tenant_id: string; user?: { sub: string; tenant_id: string } };
  }>;
  let db: Kysely<Database>;
  let adapters: ReturnType<typeof createAdapters>;
  let env: { data: ReturnType<typeof createAdapters> };

  const TEST_USER_ID = "auth0|user456";

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
      id: "control_plane",
      friendly_name: "Control Plane",
      audience: "https://example.com",
      sender_email: "admin@example.com",
      sender_name: "Control Plane",
    });

    // Create a test user on the control plane
    await adapters.users.create("control_plane", {
      user_id: TEST_USER_ID,
      email: "testuser@example.com",
      email_verified: true,
      connection: "Username-Password-Authentication",
      provider: "auth2",
    });

    // Setup multi-tenancy WITHOUT issuer (no admin role will be created)
    const multiTenancy = setupMultiTenancy({
      accessControl: {
        controlPlaneTenantId: "control_plane",
        requireOrganizationMatch: false,
        // Note: no issuer provided, so no admin role will be created
        addCreatorToOrganization: true,
      },
    });

    // Create Hono app
    app = new Hono<{
      Bindings: { data: typeof adapters };
      Variables: {
        tenant_id: string;
        user?: { sub: string; tenant_id: string };
      };
    }>();

    // Set tenant_id and user variables
    app.use("*", async (c, next) => {
      c.set("tenant_id", "control_plane");
      c.set("user", {
        sub: TEST_USER_ID,
        tenant_id: "control_plane",
      });
      await next();
    });

    // Apply multi-tenancy middleware
    app.use("*", multiTenancy.middleware);

    // Mount tenant management routes
    app.route("/management", multiTenancy.app);
  });

  it("should still add user to organization without creating admin role", async () => {
    // Create a new tenant
    const response = await app.request(
      "/management/tenants",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "no-role-tenant",
          friendly_name: "No Role Tenant",
          audience: "https://no-role.example.com",
          sender_email: "support@no-role.com",
          sender_name: "No Role",
        }),
      },
      env,
    );

    expect(response.status).toBe(201);

    // Verify organization was created
    const orgs = await adapters.organizations.list("control_plane");
    const org = orgs.organizations.find((org) => org.name === "no-role-tenant");
    expect(org).toBeDefined();

    // Verify user was added to organization
    const userOrgs = await adapters.userOrganizations.list("control_plane", {
      q: `organization_id:${org!.id}`,
    });
    const userMembership = userOrgs.userOrganizations.find(
      (uo) => uo.user_id === TEST_USER_ID,
    );
    expect(userMembership).toBeDefined();

    // Verify NO admin role was created (since no issuer was provided)
    const roles = await adapters.roles.list("control_plane", {});
    const adminRoles = roles.roles.filter((r) => r.name === "Tenant Admin");
    expect(adminRoles).toHaveLength(0);
  });
});

describe("Tenant Provisioning with addCreatorToOrganization disabled", () => {
  let app: Hono<{
    Bindings: { data: ReturnType<typeof createAdapters> };
    Variables: { tenant_id: string; user?: { sub: string; tenant_id: string } };
  }>;
  let db: Kysely<Database>;
  let adapters: ReturnType<typeof createAdapters>;
  let env: { data: ReturnType<typeof createAdapters> };

  const TEST_USER_ID = "auth0|user789";

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
      id: "main",
      friendly_name: "Control Plane",
      audience: "https://example.com",
      sender_email: "admin@example.com",
      sender_name: "Control Plane",
    });

    // Create a test user on the control plane
    await adapters.users.create("main", {
      user_id: TEST_USER_ID,
      email: "testuser@example.com",
      email_verified: true,
      connection: "Username-Password-Authentication",
      provider: "auth2",
    });

    // Setup multi-tenancy with addCreatorToOrganization disabled
    const multiTenancy = setupMultiTenancy({
      accessControl: {
        controlPlaneTenantId: "main",
        requireOrganizationMatch: false,
        issuer: "https://auth.example.com/",
        addCreatorToOrganization: false, // Explicitly disabled
      },
    });

    // Create Hono app
    app = new Hono<{
      Bindings: { data: typeof adapters };
      Variables: {
        tenant_id: string;
        user?: { sub: string; tenant_id: string };
      };
    }>();

    // Set tenant_id and user variables
    app.use("*", async (c, next) => {
      c.set("tenant_id", "main");
      c.set("user", {
        sub: TEST_USER_ID,
        tenant_id: "main",
      });
      await next();
    });

    // Apply multi-tenancy middleware
    app.use("*", multiTenancy.middleware);

    // Mount tenant management routes
    app.route("/management", multiTenancy.app);
  });

  it("should not add user to organization when addCreatorToOrganization is disabled", async () => {
    // Create a new tenant
    const response = await app.request(
      "/management/tenants",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "no-member-tenant",
          friendly_name: "No Member Tenant",
          audience: "https://no-member.example.com",
          sender_email: "support@no-member.com",
          sender_name: "No Member",
        }),
      },
      env,
    );

    expect(response.status).toBe(201);

    // Verify organization was created
    const orgs = await adapters.organizations.list("main");
    const org = orgs.organizations.find(
      (org) => org.name === "no-member-tenant",
    );
    expect(org).toBeDefined();

    // Verify user was NOT added to organization
    const userOrgs = await adapters.userOrganizations.list("main", {
      q: `organization_id:${org!.id}`,
    });
    expect(userOrgs.userOrganizations).toHaveLength(0);
  });
});
