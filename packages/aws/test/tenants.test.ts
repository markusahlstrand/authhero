import { describe, expect, it, afterEach } from "vitest";
import { getTestServer, teardownTestServer } from "./helpers/test-server";

describe("tenants", () => {
  afterEach(async () => {
    await teardownTestServer();
  });

  it("should support crud operations", async () => {
    const { data } = await getTestServer();

    // ----------------------------------------
    // Create
    // ----------------------------------------
    const created = await data.tenants.create({
      id: "test-tenant",
      friendly_name: "Test Tenant",
      audience: "https://api.example.com",
      sender_email: "noreply@example.com",
      sender_name: "Test",
    });

    expect(created.id).toBe("test-tenant");
    expect(created.friendly_name).toBe("Test Tenant");
    expect(created.created_at).toBeDefined();
    expect(created.updated_at).toBeDefined();

    // ----------------------------------------
    // Get
    // ----------------------------------------
    const fetched = await data.tenants.get("test-tenant");
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe("test-tenant");
    expect(fetched?.friendly_name).toBe("Test Tenant");

    // ----------------------------------------
    // Update
    // ----------------------------------------
    await data.tenants.update("test-tenant", {
      friendly_name: "Updated Tenant Name",
    });

    // Verify update
    const fetchedAfterUpdate = await data.tenants.get("test-tenant");
    expect(fetchedAfterUpdate?.friendly_name).toBe("Updated Tenant Name");

    // ----------------------------------------
    // List
    // ----------------------------------------
    const list = await data.tenants.list();
    expect(list.tenants.length).toBeGreaterThanOrEqual(1);
    expect(list.tenants.some((t) => t.id === "test-tenant")).toBe(true);

    // ----------------------------------------
    // Delete
    // ----------------------------------------
    const deleted = await data.tenants.remove("test-tenant");
    expect(deleted).toBe(true);

    // Verify deletion
    const fetchedAfterDelete = await data.tenants.get("test-tenant");
    expect(fetchedAfterDelete).toBeNull();
  });

  it("should return null for non-existent tenant", async () => {
    const { data } = await getTestServer();

    const result = await data.tenants.get("non-existent-tenant");
    expect(result).toBeNull();
  });

  it("should handle multiple tenants", async () => {
    const { data } = await getTestServer();

    await data.tenants.create({
      id: "tenant-1",
      friendly_name: "Tenant 1",
      audience: "https://api1.example.com",
      sender_email: "noreply@tenant1.com",
      sender_name: "Tenant 1",
    });

    await data.tenants.create({
      id: "tenant-2",
      friendly_name: "Tenant 2",
      audience: "https://api2.example.com",
      sender_email: "noreply@tenant2.com",
      sender_name: "Tenant 2",
    });

    const list = await data.tenants.list();
    expect(list.tenants.length).toBe(2);
  });
});
