import { describe, expect, it, afterEach } from "vitest";
import { getTestServer, teardownTestServer } from "./helpers/test-server";
import { OrganizationInsert } from "@authhero/adapter-interfaces";

describe("organizations", () => {
  afterEach(async () => {
    await teardownTestServer();
  });

  it("should create an organization", async () => {
    const { data } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    const organizationData: OrganizationInsert = {
      name: "Test Organization",
      display_name: "Test Organization Display Name",
    };

    const organization = await data.organizations.create(
      "tenantId",
      organizationData,
    );

    expect(organization).toBeDefined();
    expect(organization.id).toBeDefined();
    expect(organization.name).toBe("Test Organization");
    expect(organization.display_name).toBe("Test Organization Display Name");
  });

  it("should get an organization by id", async () => {
    const { data } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    const organizationData: OrganizationInsert = {
      name: "Test Organization",
    };

    const created = await data.organizations.create("tenantId", organizationData);
    const retrieved = await data.organizations.get("tenantId", created.id);

    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(created.id);
    expect(retrieved!.name).toBe("Test Organization");
  });

  it("should list organizations", async () => {
    const { data } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    const org1: OrganizationInsert = { name: "Organization 1" };
    const org2: OrganizationInsert = { name: "Organization 2" };

    await data.organizations.create("tenantId", org1);
    await data.organizations.create("tenantId", org2);

    const result = await data.organizations.list("tenantId");

    expect(result.organizations).toHaveLength(2);
    expect(result.organizations.map((o) => o.name)).toContain("Organization 1");
    expect(result.organizations.map((o) => o.name)).toContain("Organization 2");
  });

  it("should update an organization", async () => {
    const { data } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    const organizationData: OrganizationInsert = {
      name: "Original Name",
    };

    const created = await data.organizations.create("tenantId", organizationData);
    const updated = await data.organizations.update("tenantId", created.id, {
      name: "Updated Name",
      display_name: "Updated Display Name",
    });

    expect(updated).toBe(true);

    const retrieved = await data.organizations.get("tenantId", created.id);
    expect(retrieved!.name).toBe("Updated Name");
    expect(retrieved!.display_name).toBe("Updated Display Name");
  });

  it("should remove an organization", async () => {
    const { data } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    const organizationData: OrganizationInsert = {
      name: "To Be Deleted",
    };

    const created = await data.organizations.create("tenantId", organizationData);
    const removed = await data.organizations.remove("tenantId", created.id);

    expect(removed).toBe(true);

    const retrieved = await data.organizations.get("tenantId", created.id);
    expect(retrieved).toBeNull();
  });
});
