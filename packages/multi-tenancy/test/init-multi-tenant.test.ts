import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import { Database } from "@authhero/kysely-adapter";
import createAdapters, { migrateToLatest } from "@authhero/kysely-adapter";
import {
  MANAGEMENT_API_SCOPES,
  CreateTenantParams,
  Tenant,
  USERNAME_PASSWORD_PROVIDER,
} from "authhero";
import { createProvisioningHooks, createSyncHooks } from "../src/hooks";
import { createTenantsOpenAPIRouter } from "../src/routes";
import { TenantEntityHooks, TenantHookContext } from "../src/types";

/**
 * This test verifies that the hook composition used by initMultiTenant correctly
 * chains provisioning hooks (organization creation) with sync hooks (entity syncing).
 *
 * It reproduces the exact hook chaining from initMultiTenant to verify that
 * organizations are created on the control plane when tenants are created.
 */
describe("initMultiTenant hook chaining - organization creation", () => {
  let app: Hono<{
    Bindings: { data: ReturnType<typeof createAdapters> };
    Variables: {
      tenant_id: string;
      user?: { sub: string; tenant_id: string };
    };
  }>;
  let db: Kysely<Database>;
  let adapters: ReturnType<typeof createAdapters>;
  let env: { data: ReturnType<typeof createAdapters> };
  const testUserId = "auth0|test-user-123";
  const controlPlaneTenantId = "control_plane";

  beforeEach(async () => {
    const dialect = new SqliteDialect({
      database: new SQLite(":memory:"),
    });
    db = new Kysely<Database>({ dialect });
    await migrateToLatest(db, false);
    adapters = createAdapters(db);
    env = { data: adapters };

    // Create control plane tenant
    await adapters.tenants.create({
      id: controlPlaneTenantId,
      friendly_name: "Control Plane",
      audience: "https://example.com",
      sender_email: "admin@example.com",
      sender_name: "Control Plane",
    });

    // Create the Management API resource server on the control plane
    await adapters.resourceServers.create(controlPlaneTenantId, {
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
    await adapters.users.create(controlPlaneTenantId, {
      user_id: testUserId,
      email: "test@example.com",
      email_verified: true,
      connection: "Username-Password-Authentication",
      provider: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
    });

    // Reproduce the exact hook composition from initMultiTenant
    const { tenantHooks } = createSyncHooks({
      controlPlaneTenantId,
      getChildTenantIds: async () => {
        const result = await adapters.tenants.list({});
        return result.tenants
          .filter((t) => t.id !== controlPlaneTenantId)
          .map((t) => t.id);
      },
      getAdapters: async () => adapters,
      getControlPlaneAdapters: async () => adapters,
      sync: { resourceServers: true, roles: true },
    });

    const provisioningHooks = createProvisioningHooks({
      accessControl: {
        controlPlaneTenantId,
        requireOrganizationMatch: false,
        defaultPermissions: ["tenant:admin"],
      },
    });

    // Chain provisioning + sync hooks (same logic as initMultiTenant after the fix)
    const combinedTenantHooks: TenantEntityHooks = {
      async beforeCreate(
        ctx: TenantHookContext,
        params: CreateTenantParams,
      ): Promise<CreateTenantParams> {
        if (provisioningHooks.beforeCreate) {
          params = await provisioningHooks.beforeCreate(ctx, params);
        }
        if (tenantHooks.beforeCreate) {
          params = await tenantHooks.beforeCreate(ctx, params);
        }
        return params;
      },
      async afterCreate(ctx: TenantHookContext, tenant: Tenant): Promise<void> {
        await provisioningHooks.afterCreate?.(ctx, tenant);
        await tenantHooks.afterCreate?.(ctx, tenant);
      },
      async beforeDelete(
        ctx: TenantHookContext,
        tenantId: string,
      ): Promise<void> {
        await provisioningHooks.beforeDelete?.(ctx, tenantId);
        await tenantHooks.beforeDelete?.(ctx, tenantId);
      },
    };

    const tenantsRouter = createTenantsOpenAPIRouter(
      {
        accessControl: {
          controlPlaneTenantId,
          requireOrganizationMatch: false,
          defaultPermissions: ["tenant:admin"],
        },
      },
      { tenants: combinedTenantHooks },
    );

    app = new Hono<{
      Bindings: { data: typeof adapters };
      Variables: {
        tenant_id: string;
        user?: { sub: string; tenant_id: string };
      };
    }>();

    // Simulate authenticated user
    app.use("*", async (c, next) => {
      c.set("tenant_id", controlPlaneTenantId);
      c.set("user", { sub: testUserId, tenant_id: controlPlaneTenantId });
      await next();
    });

    app.route("/tenants", tenantsRouter);
  });

  it("should create organization on control plane when tenant is created", async () => {
    const response = await app.request(
      "/tenants",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

    // Verify organization was created on control plane
    const orgs = await adapters.organizations.list(controlPlaneTenantId);
    const acmeOrg = orgs.organizations.find((org) => org.name === "acme");
    expect(acmeOrg).toBeDefined();
    expect(acmeOrg?.name).toBe("acme");
    expect(acmeOrg?.display_name).toBe("Acme Corporation");
  });

  it("should add creator to organization when tenant is created", async () => {
    const response = await app.request(
      "/tenants",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

    // Verify organization was created
    const orgs = await adapters.organizations.list(controlPlaneTenantId);
    const newTenantOrg = orgs.organizations.find(
      (org) => org.name === "new-tenant",
    );
    expect(newTenantOrg).toBeDefined();

    // Verify the creator user was added to the organization
    const userOrgs = await adapters.userOrganizations.listUserOrganizations(
      controlPlaneTenantId,
      testUserId,
    );
    const isMember = userOrgs.organizations.some(
      (o) => o.id === newTenantOrg!.id,
    );
    expect(isMember).toBe(true);
  });

  it("should also sync resource servers to new tenant", async () => {
    // Create a resource server on the control plane that should be synced
    await adapters.resourceServers.create(controlPlaneTenantId, {
      name: "Custom API",
      identifier: "https://api.example.com",
      allow_offline_access: false,
      skip_consent_for_verifiable_first_party_clients: false,
      token_lifetime: 86400,
      token_lifetime_for_web: 7200,
      signing_alg: "RS256",
    });

    const response = await app.request(
      "/tenants",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "synced-tenant",
          friendly_name: "Synced Tenant",
          audience: "https://synced.example.com",
          sender_email: "support@synced.com",
          sender_name: "Synced",
        }),
      },
      env,
    );

    expect(response.status).toBe(201);

    // Verify organization was created (provisioning hooks ran)
    const orgs = await adapters.organizations.list(controlPlaneTenantId);
    const org = orgs.organizations.find((org) => org.name === "synced-tenant");
    expect(org).toBeDefined();

    // Verify resource servers were synced (sync hooks also ran)
    const rsResult = await adapters.resourceServers.list("synced-tenant", {});
    const syncedApis = rsResult.resource_servers.filter(
      (rs) => rs.name === "Custom API" || rs.name === "Authhero Management API",
    );
    expect(syncedApis.length).toBeGreaterThan(0);
  });
});
