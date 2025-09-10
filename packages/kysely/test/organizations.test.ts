import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "./helpers/test-server";
import { OrganizationInsert } from "@authhero/adapter-interfaces";

describe("OrganizationsAdapter", () => {
  let adapter: any;
  const tenantId = "test-tenant";

  beforeEach(async () => {
    const { data } = await getTestServer();
    adapter = data;
  });

  it("should create an organization", async () => {
    const organizationData: OrganizationInsert = {
      name: "Test Organization",
      display_name: "Test Organization Display Name",
      branding: {
        logo_url: "https://example.com/logo.png",
        colors: {
          primary: "#FF0000",
          page_background: "#FFFFFF",
        },
      },
      metadata: {
        custom_field: "custom_value",
      },
      enabled_connections: [
        {
          connection_id: "conn_123",
          assign_membership_on_login: true,
          show_as_button: true,
          is_signup_enabled: true,
        },
      ],
      token_quota: {
        client_credentials: {
          enforce: true,
          per_day: 1000,
          per_hour: 100,
        },
      },
    };

    const organization = await adapter.organizations.create(
      tenantId,
      organizationData,
    );

    expect(organization).toBeDefined();
    expect(organization.id).toBeDefined();
    expect(organization.name).toBe("Test Organization");
    expect(organization.display_name).toBe("Test Organization Display Name");
    expect(organization.branding.logo_url).toBe("https://example.com/logo.png");
    expect(organization.metadata.custom_field).toBe("custom_value");
  });

  it("should get an organization by id", async () => {
    const organizationData: OrganizationInsert = {
      name: "Test Organization",
    };

    const created = await adapter.organizations.create(
      tenantId,
      organizationData,
    );
    const retrieved = await adapter.organizations.get(tenantId, created.id);

    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(created.id);
    expect(retrieved!.name).toBe("Test Organization");
  });

  it("should list organizations", async () => {
    const org1: OrganizationInsert = { name: "Organization 1" };
    const org2: OrganizationInsert = { name: "Organization 2" };

    await adapter.organizations.create(tenantId, org1);
    await adapter.organizations.create(tenantId, org2);

    const result = await adapter.organizations.list(tenantId);

    expect(result.organizations).toHaveLength(2);
    expect(result.organizations.map((o: any) => o.name)).toContain(
      "Organization 1",
    );
    expect(result.organizations.map((o: any) => o.name)).toContain(
      "Organization 2",
    );
  });

  it("should update an organization", async () => {
    const organizationData: OrganizationInsert = {
      name: "Original Name",
    };

    const created = await adapter.organizations.create(
      tenantId,
      organizationData,
    );
    const updated = await adapter.organizations.update(tenantId, created.id, {
      name: "Updated Name",
      display_name: "Updated Display Name",
    });

    expect(updated).toBe(true);

    const retrieved = await adapter.organizations.get(tenantId, created.id);
    expect(retrieved!.name).toBe("Updated Name");
    expect(retrieved!.display_name).toBe("Updated Display Name");
  });

  it("should remove an organization", async () => {
    const organizationData: OrganizationInsert = {
      name: "To Be Deleted",
    };

    const created = await adapter.organizations.create(
      tenantId,
      organizationData,
    );
    const removed = await adapter.organizations.remove(tenantId, created.id);

    expect(removed).toBe(true);

    const retrieved = await adapter.organizations.get(tenantId, created.id);
    expect(retrieved).toBeNull();
  });
});
