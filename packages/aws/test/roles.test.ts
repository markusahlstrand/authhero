import { describe, expect, it, afterEach } from "vitest";
import { getTestServer, teardownTestServer } from "./helpers/test-server";

describe("roles", () => {
  afterEach(async () => {
    await teardownTestServer();
  });

  it("should support crud operations", async () => {
    const { data } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    // ----------------------------------------
    // Create
    // ----------------------------------------
    const created = await data.roles.create("tenantId", {
      name: "admin",
      description: "Administrator role",
    });

    expect(created.id).toBeDefined();
    expect(created.name).toBe("admin");
    expect(created.description).toBe("Administrator role");

    // ----------------------------------------
    // Get
    // ----------------------------------------
    const fetched = await data.roles.get("tenantId", created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe("admin");

    // ----------------------------------------
    // Update
    // ----------------------------------------
    const updated = await data.roles.update("tenantId", created.id, {
      description: "Updated description",
    });
    expect(updated).toBe(true);

    // Verify update
    const fetchedAfterUpdate = await data.roles.get("tenantId", created.id);
    expect(fetchedAfterUpdate?.description).toBe("Updated description");

    // ----------------------------------------
    // List
    // ----------------------------------------
    const list = await data.roles.list("tenantId");
    expect(list.roles.length).toBeGreaterThanOrEqual(1);

    // ----------------------------------------
    // Delete
    // ----------------------------------------
    const deleted = await data.roles.remove("tenantId", created.id);
    expect(deleted).toBe(true);

    // Verify deletion
    const fetchedAfterDelete = await data.roles.get("tenantId", created.id);
    expect(fetchedAfterDelete).toBeNull();
  });

  it("should create multiple roles", async () => {
    const { data } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    await data.roles.create("tenantId", {
      name: "admin",
      description: "Administrator",
    });

    await data.roles.create("tenantId", {
      name: "user",
      description: "Regular user",
    });

    await data.roles.create("tenantId", {
      name: "moderator",
      description: "Moderator",
    });

    const list = await data.roles.list("tenantId");
    expect(list.roles).toHaveLength(3);
  });
});
