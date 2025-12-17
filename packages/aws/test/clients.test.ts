import { describe, expect, it, afterEach } from "vitest";
import { getTestServer, teardownTestServer } from "./helpers/test-server";

describe("clients", () => {
  afterEach(async () => {
    await teardownTestServer();
  });

  it("should support crud operations", async () => {
    const { data } = await getTestServer();

    // Create tenant first
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
    const created = await data.clients.create("tenantId", {
      client_id: "test-client-id",
      name: "Test Application",
      callbacks: ["https://app.example.com/callback"],
      allowed_logout_urls: ["https://app.example.com/logout"],
      allowed_origins: ["https://app.example.com"],
      web_origins: ["https://app.example.com"],
    });

    expect(created.client_id).toBe("test-client-id");
    expect(created.name).toBe("Test Application");
    expect(created.callbacks).toContain("https://app.example.com/callback");

    // ----------------------------------------
    // Get
    // ----------------------------------------
    const fetched = await data.clients.get("tenantId", "test-client-id");
    expect(fetched).not.toBeNull();
    expect(fetched?.client_id).toBe("test-client-id");
    expect(fetched?.name).toBe("Test Application");

    // ----------------------------------------
    // Update
    // ----------------------------------------
    const updated = await data.clients.update("tenantId", "test-client-id", {
      name: "Updated Application Name",
    });
    expect(updated).toBe(true);

    // Verify update
    const fetchedAfterUpdate = await data.clients.get("tenantId", "test-client-id");
    expect(fetchedAfterUpdate?.name).toBe("Updated Application Name");

    // ----------------------------------------
    // List
    // ----------------------------------------
    const list = await data.clients.list("tenantId", {});
    expect(list.clients.length).toBeGreaterThanOrEqual(1);
    expect(list.clients.some((c) => c.client_id === "test-client-id")).toBe(true);

    // ----------------------------------------
    // Delete
    // ----------------------------------------
    const deleted = await data.clients.remove("tenantId", "test-client-id");
    expect(deleted).toBe(true);

    // Verify deletion
    const fetchedAfterDelete = await data.clients.get("tenantId", "test-client-id");
    expect(fetchedAfterDelete).toBeNull();
  });

  it("should create multiple clients", async () => {
    const { data } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    await data.clients.create("tenantId", {
      client_id: "client-1",
      name: "Client 1",
    });

    await data.clients.create("tenantId", {
      client_id: "client-2",
      name: "Client 2",
    });

    const list = await data.clients.list("tenantId", {});
    expect(list.clients.length).toBe(2);
  });
});
