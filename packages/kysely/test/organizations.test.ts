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

  it("should paginate organizations with page/per_page", async () => {
    // Create 5 organizations
    for (let i = 0; i < 5; i++) {
      await adapter.organizations.create(tenantId, {
        name: `Paginated Org ${i}`,
      });
    }

    // Get first page
    const page1 = await adapter.organizations.list(tenantId, {
      page: 0,
      per_page: 2,
      include_totals: true,
    });

    expect(page1.organizations).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.start).toBe(0);
    expect(page1.limit).toBe(2);

    // Get second page
    const page2 = await adapter.organizations.list(tenantId, {
      page: 1,
      per_page: 2,
      include_totals: true,
    });

    expect(page2.organizations).toHaveLength(2);
    expect(page2.start).toBe(2);

    // Verify different results
    const page1Ids = page1.organizations.map((o: any) => o.id);
    const page2Ids = page2.organizations.map((o: any) => o.id);
    expect(page1Ids).not.toEqual(page2Ids);
  });

  it("should paginate organizations with from/take (checkpoint)", async () => {
    // Create 5 organizations
    for (let i = 0; i < 5; i++) {
      await adapter.organizations.create(tenantId, {
        name: `Checkpoint Org ${i}`,
      });
    }

    // Get first batch using checkpoint pagination
    const batch1 = await adapter.organizations.list(tenantId, {
      from: "0",
      take: 2,
      include_totals: true,
    });

    expect(batch1.organizations).toHaveLength(2);
    expect(batch1.total).toBe(5);
    expect(batch1.start).toBe(0);
    expect(batch1.limit).toBe(2);

    // Get second batch
    const batch2 = await adapter.organizations.list(tenantId, {
      from: "2",
      take: 2,
      include_totals: true,
    });

    expect(batch2.organizations).toHaveLength(2);
    expect(batch2.start).toBe(2);

    // Verify different results
    const batch1Ids = batch1.organizations.map((o: any) => o.id);
    const batch2Ids = batch2.organizations.map((o: any) => o.id);
    expect(batch1Ids).not.toEqual(batch2Ids);
  });

  it("should search organizations with q parameter", async () => {
    await adapter.organizations.create(tenantId, {
      name: "acme-corp",
      display_name: "Acme Corporation",
    });
    await adapter.organizations.create(tenantId, {
      name: "globex",
      display_name: "Globex Industries",
    });
    await adapter.organizations.create(tenantId, {
      name: "acme-labs",
      display_name: "Acme Labs",
    });

    const result = await adapter.organizations.list(tenantId, {
      q: "acme",
      include_totals: true,
    });

    expect(result.organizations).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(
      result.organizations.every(
        (o: any) => o.name.includes("acme") || o.display_name?.includes("Acme"),
      ),
    ).toBe(true);
  });

  it("should sort organizations", async () => {
    await adapter.organizations.create(tenantId, { name: "zebra-org" });
    await adapter.organizations.create(tenantId, { name: "alpha-org" });
    await adapter.organizations.create(tenantId, { name: "beta-org" });

    // Sort ascending
    const ascResult = await adapter.organizations.list(tenantId, {
      sort: { sort_by: "name", sort_order: "asc" },
    });

    expect(ascResult.organizations[0].name).toBe("alpha-org");
    expect(ascResult.organizations[1].name).toBe("beta-org");
    expect(ascResult.organizations[2].name).toBe("zebra-org");

    // Sort descending
    const descResult = await adapter.organizations.list(tenantId, {
      sort: { sort_by: "name", sort_order: "desc" },
    });

    expect(descResult.organizations[0].name).toBe("zebra-org");
    expect(descResult.organizations[1].name).toBe("beta-org");
    expect(descResult.organizations[2].name).toBe("alpha-org");
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
