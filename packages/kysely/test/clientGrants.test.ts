import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "./helpers/test-server";
import { ClientGrantInsert } from "@authhero/adapter-interfaces";

describe("ClientGrantsAdapter", () => {
  let adapter: any;
  let db: any;
  const tenantId = "test-tenant";

  beforeEach(async () => {
    const testServer = await getTestServer();
    adapter = testServer.data;
    db = testServer.db;

    // Create a test tenant
    await db
      .insertInto("tenants")
      .values({
        id: tenantId,
        name: "Test Tenant",
        audience: "https://test.authhero.com/api/v2/",
        sender_email: "test@authhero.com",
        sender_name: "Test Sender",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();

    // Create a test client
    await db
      .insertInto("clients")
      .values({
        tenant_id: tenantId,
        client_id: "test-client-id",
        name: "Test Client",
        client_secret: "test-secret",
        callbacks: "[]",
        allowed_origins: "[]",
        web_origins: "[]",
        client_aliases: "[]",
        allowed_clients: "[]",
        allowed_logout_urls: "[]",
        session_transfer: "{}",
        oidc_logout: "{}",
        grant_types: "[]",
        jwt_configuration: "{}",
        signing_keys: "[]",
        encryption_key: "{}",
        addons: "{}",
        client_metadata: "{}",
        mobile: "{}",
        native_social_login: "{}",
        refresh_token: "{}",
        default_organization: "{}",
        client_authentication_methods: "{}",
        signed_request_object: "{}",
        token_quota: "{}",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();

    // Create a test resource server (for audience)
    await db
      .insertInto("resource_servers")
      .values({
        id: "test-api-id",
        tenant_id: tenantId,
        identifier: "https://test.api.com",
        name: "Test API",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();
  });

  it("should create a client grant", async () => {
    const clientGrantData: ClientGrantInsert = {
      client_id: "test-client-id",
      audience: "https://test.api.com",
      scope: ["read:users", "write:users"],
      organization_usage: "allow",
      allow_any_organization: false,
      is_system: false,
      subject_type: "client",
      authorization_details_types: ["payment_initiation", "account_information"],
    };

    const clientGrant = await adapter.clientGrants.create(
      tenantId,
      clientGrantData,
    );

    expect(clientGrant).toBeDefined();
    expect(clientGrant.id).toBeDefined();
    expect(clientGrant.client_id).toBe("test-client-id");
    expect(clientGrant.audience).toBe("https://test.api.com");
    expect(clientGrant.scope).toEqual(["read:users", "write:users"]);
    expect(clientGrant.organization_usage).toBe("allow");
    expect(clientGrant.allow_any_organization).toBe(false);
    expect(clientGrant.is_system).toBe(false);
    expect(clientGrant.subject_type).toBe("client");
    expect(clientGrant.authorization_details_types).toEqual([
      "payment_initiation",
      "account_information",
    ]);
    expect(clientGrant.created_at).toBeDefined();
    expect(clientGrant.updated_at).toBeDefined();
  });

  it("should create a client grant with minimal data", async () => {
    const clientGrantData: ClientGrantInsert = {
      client_id: "test-client-id",
      audience: "https://test.api.com",
    };

    const clientGrant = await adapter.clientGrants.create(
      tenantId,
      clientGrantData,
    );

    expect(clientGrant).toBeDefined();
    expect(clientGrant.id).toBeDefined();
    expect(clientGrant.client_id).toBe("test-client-id");
    expect(clientGrant.audience).toBe("https://test.api.com");
    expect(clientGrant.scope).toEqual([]);
    expect(clientGrant.authorization_details_types).toEqual([]);
    expect(clientGrant.allow_any_organization).toBe(false);
    expect(clientGrant.is_system).toBe(false);
  });

  it("should get a client grant by id", async () => {
    const clientGrantData: ClientGrantInsert = {
      client_id: "test-client-id",
      audience: "https://test.api.com",
      scope: ["read:profile"],
    };

    const created = await adapter.clientGrants.create(
      tenantId,
      clientGrantData,
    );
    const retrieved = await adapter.clientGrants.get(tenantId, created.id);

    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(created.id);
    expect(retrieved!.client_id).toBe("test-client-id");
    expect(retrieved!.audience).toBe("https://test.api.com");
    expect(retrieved!.scope).toEqual(["read:profile"]);
  });

  it("should return null when getting non-existent client grant", async () => {
    const retrieved = await adapter.clientGrants.get(
      tenantId,
      "non-existent-id",
    );

    expect(retrieved).toBeNull();
  });

  it("should list client grants", async () => {
    // Create another resource server for the second grant
    await db
      .insertInto("resource_servers")
      .values({
        id: "test-api-2-id",
        tenant_id: tenantId,
        identifier: "https://api2.example.com",
        name: "Test API 2",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();

    const grant1: ClientGrantInsert = {
      client_id: "test-client-id",
      audience: "https://test.api.com",
      scope: ["read:users"],
    };
    const grant2: ClientGrantInsert = {
      client_id: "test-client-id",
      audience: "https://api2.example.com",
      scope: ["write:users"],
    };

    await adapter.clientGrants.create(tenantId, grant1);
    await adapter.clientGrants.create(tenantId, grant2);

    const result = await adapter.clientGrants.list(tenantId);

    expect(result.client_grants).toHaveLength(2);
    expect(result.client_grants[0].client_id).toBe("test-client-id");
    expect(result.client_grants[1].client_id).toBe("test-client-id");
    
    const scopes = result.client_grants.map((g: any) => g.scope);
    expect(scopes).toContainEqual(["read:users"]);
    expect(scopes).toContainEqual(["write:users"]);
  });

  it("should list client grants with pagination", async () => {
    // Create multiple resource servers for different grants
    for (let i = 0; i < 5; i++) {
      await db
        .insertInto("resource_servers")
        .values({
          id: `api-${i}-id`,
          tenant_id: tenantId,
          identifier: `https://api${i}.example.com`,
          name: `API ${i}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();
    }

    // Create multiple client grants
    for (let i = 0; i < 5; i++) {
      const grant: ClientGrantInsert = {
        client_id: "test-client-id",
        audience: `https://api${i}.example.com`,
        scope: [`read:resource${i}`],
      };
      await adapter.clientGrants.create(tenantId, grant);
    }

    const result = await adapter.clientGrants.list(tenantId, {
      page: 0,
      per_page: 3,
      include_totals: true,
    });

    expect(result.client_grants).toHaveLength(3);
    expect(result.length).toBe(5);
    expect(result.start).toBe(0);
    expect(result.limit).toBe(3);
  });

  it("should filter client grants by audience", async () => {
    // Create another resource server
    await db
      .insertInto("resource_servers")
      .values({
        id: "test-api-2-id",
        tenant_id: tenantId,
        identifier: "https://api2.test.com",
        name: "Test API 2",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();

    const grant1: ClientGrantInsert = {
      client_id: "test-client-id",
      audience: "https://test.api.com",
      scope: ["read:users"],
    };
    const grant2: ClientGrantInsert = {
      client_id: "test-client-id",
      audience: "https://api2.test.com",
      scope: ["write:users"],
    };

    await adapter.clientGrants.create(tenantId, grant1);
    await adapter.clientGrants.create(tenantId, grant2);

    const result = await adapter.clientGrants.list(tenantId, {
      audience: "https://test.api.com",
    });

    expect(result.client_grants).toHaveLength(1);
    expect(result.client_grants[0].audience).toBe("https://test.api.com");
    expect(result.client_grants[0].scope).toEqual(["read:users"]);
  });

  it("should filter client grants by client_id", async () => {
    // Create another client
    await db
      .insertInto("clients")
      .values({
        tenant_id: tenantId,
        client_id: "test-client-2-id",
        name: "Test Client 2",
        client_secret: "test-secret-2",
        callbacks: "[]",
        allowed_origins: "[]",
        web_origins: "[]",
        client_aliases: "[]",
        allowed_clients: "[]",
        allowed_logout_urls: "[]",
        session_transfer: "{}",
        oidc_logout: "{}",
        grant_types: "[]",
        jwt_configuration: "{}",
        signing_keys: "[]",
        encryption_key: "{}",
        addons: "{}",
        client_metadata: "{}",
        mobile: "{}",
        native_social_login: "{}",
        refresh_token: "{}",
        default_organization: "{}",
        client_authentication_methods: "{}",
        signed_request_object: "{}",
        token_quota: "{}",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();

    const grant1: ClientGrantInsert = {
      client_id: "test-client-id",
      audience: "https://test.api.com",
      scope: ["read:users"],
    };
    const grant2: ClientGrantInsert = {
      client_id: "test-client-2-id",
      audience: "https://test.api.com",
      scope: ["write:users"],
    };

    await adapter.clientGrants.create(tenantId, grant1);
    await adapter.clientGrants.create(tenantId, grant2);

    const result = await adapter.clientGrants.list(tenantId, {
      client_id: "test-client-id",
    });

    expect(result.client_grants).toHaveLength(1);
    expect(result.client_grants[0].client_id).toBe("test-client-id");
    expect(result.client_grants[0].scope).toEqual(["read:users"]);
  });

  it("should update a client grant", async () => {
    const clientGrantData: ClientGrantInsert = {
      client_id: "test-client-id",
      audience: "https://test.api.com",
      scope: ["read:users"],
      organization_usage: "deny",
      allow_any_organization: false,
    };

    const created = await adapter.clientGrants.create(
      tenantId,
      clientGrantData,
    );
    
    // Add a delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const updated = await adapter.clientGrants.update(tenantId, created.id, {
      scope: ["read:users", "write:users", "delete:users"],
      organization_usage: "allow",
      allow_any_organization: true,
      subject_type: "user",
    });

    expect(updated).toBe(true);

    const retrieved = await adapter.clientGrants.get(tenantId, created.id);
    expect(retrieved!.scope).toEqual([
      "read:users",
      "write:users",
      "delete:users",
    ]);
    expect(retrieved!.organization_usage).toBe("allow");
    expect(retrieved!.allow_any_organization).toBe(true);
    expect(retrieved!.subject_type).toBe("user");
    expect(new Date(retrieved!.updated_at!).getTime()).toBeGreaterThanOrEqual(new Date(created.updated_at!).getTime());
  });

  it("should not update non-existent client grant", async () => {
    const updated = await adapter.clientGrants.update(
      tenantId,
      "non-existent-id",
      {
        scope: ["read:users"],
      },
    );

    expect(updated).toBe(false);
  });

  it("should remove a client grant", async () => {
    const clientGrantData: ClientGrantInsert = {
      client_id: "test-client-id",
      audience: "https://test.api.com",
      scope: ["read:users"],
    };

    const created = await adapter.clientGrants.create(
      tenantId,
      clientGrantData,
    );
    const removed = await adapter.clientGrants.remove(tenantId, created.id);

    expect(removed).toBe(true);

    const retrieved = await adapter.clientGrants.get(tenantId, created.id);
    expect(retrieved).toBeNull();
  });

  it("should not remove non-existent client grant", async () => {
    const removed = await adapter.clientGrants.remove(
      tenantId,
      "non-existent-id",
    );

    expect(removed).toBe(false);
  });

  it("should enforce unique constraint on tenant_id + client_id + audience", async () => {
    const clientGrantData: ClientGrantInsert = {
      client_id: "test-client-id",
      audience: "https://test.api.com",
      scope: ["read:users"],
    };

    // Create first client grant
    await adapter.clientGrants.create(tenantId, clientGrantData);

    // Attempt to create duplicate should fail
    await expect(
      adapter.clientGrants.create(tenantId, clientGrantData),
    ).rejects.toThrow();
  });

  it("should handle JSON serialization for scope and authorization_details_types", async () => {
    const clientGrantData: ClientGrantInsert = {
      client_id: "test-client-id",
      audience: "https://test.api.com",
      scope: ["read:users", "write:users", "admin:users"],
      authorization_details_types: [
        "payment_initiation",
        "account_information",
        "fundsconfirmation",
      ],
    };

    const created = await adapter.clientGrants.create(
      tenantId,
      clientGrantData,
    );
    const retrieved = await adapter.clientGrants.get(tenantId, created.id);

    expect(retrieved!.scope).toEqual([
      "read:users",
      "write:users",
      "admin:users",
    ]);
    expect(retrieved!.authorization_details_types).toEqual([
      "payment_initiation",
      "account_information",
      "fundsconfirmation",
    ]);
  });

  it("should handle empty arrays for scope and authorization_details_types", async () => {
    const clientGrantData: ClientGrantInsert = {
      client_id: "test-client-id",
      audience: "https://test.api.com",
      scope: [],
      authorization_details_types: [],
    };

    const created = await adapter.clientGrants.create(
      tenantId,
      clientGrantData,
    );
    const retrieved = await adapter.clientGrants.get(tenantId, created.id);

    expect(retrieved!.scope).toEqual([]);
    expect(retrieved!.authorization_details_types).toEqual([]);
  });

  it("should handle tenant isolation", async () => {
    const anotherTenantId = "another-tenant";

    // Create another tenant
    await db
      .insertInto("tenants")
      .values({
        id: anotherTenantId,
        name: "Another Tenant",
        audience: "https://another.authhero.com/api/v2/",
        sender_email: "another@authhero.com",
        sender_name: "Another Sender",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();

    // Create client for another tenant
    await db
      .insertInto("clients")
      .values({
        tenant_id: anotherTenantId,
        client_id: "another-client-id",
        name: "Another Client",
        client_secret: "another-secret",
        callbacks: "[]",
        allowed_origins: "[]",
        web_origins: "[]",
        client_aliases: "[]",
        allowed_clients: "[]",
        allowed_logout_urls: "[]",
        session_transfer: "{}",
        oidc_logout: "{}",
        grant_types: "[]",
        jwt_configuration: "{}",
        signing_keys: "[]",
        encryption_key: "{}",
        addons: "{}",
        client_metadata: "{}",
        mobile: "{}",
        native_social_login: "{}",
        refresh_token: "{}",
        default_organization: "{}",
        client_authentication_methods: "{}",
        signed_request_object: "{}",
        token_quota: "{}",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();

    // Create resource server for another tenant
    await db
      .insertInto("resource_servers")
      .values({
        id: "another-api-id",
        tenant_id: anotherTenantId,
        identifier: "https://another.api.com",
        name: "Another API",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();

    const grant1: ClientGrantInsert = {
      client_id: "test-client-id",
      audience: "https://test.api.com",
      scope: ["read:users"],
    };
    const grant2: ClientGrantInsert = {
      client_id: "another-client-id",
      audience: "https://another.api.com",
      scope: ["write:users"],
    };

    // Create grants in different tenants
    const created1 = await adapter.clientGrants.create(tenantId, grant1);
    const created2 = await adapter.clientGrants.create(anotherTenantId, grant2);

    // Each tenant should only see their own grants
    const tenant1Grants = await adapter.clientGrants.list(tenantId);
    const tenant2Grants = await adapter.clientGrants.list(anotherTenantId);

    expect(tenant1Grants.client_grants).toHaveLength(1);
    expect(tenant1Grants.client_grants[0].id).toBe(created1.id);

    expect(tenant2Grants.client_grants).toHaveLength(1);
    expect(tenant2Grants.client_grants[0].id).toBe(created2.id);

    // Cross-tenant access should return null
    const crossAccess1 = await adapter.clientGrants.get(
      tenantId,
      created2.id,
    );
    const crossAccess2 = await adapter.clientGrants.get(
      anotherTenantId,
      created1.id,
    );

    expect(crossAccess1).toBeNull();
    expect(crossAccess2).toBeNull();
  });
});
