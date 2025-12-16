import { describe, expect, it, afterEach } from "vitest";
import { getTestServer, teardownTestServer } from "./helpers/test-server";

describe("connections", () => {
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
    const created = await data.connections.create("tenantId", {
      name: "google-oauth2",
      strategy: "google-oauth2",
      options: {
        client_id: "google-client-id",
        client_secret: "google-client-secret",
      },
    });

    expect(created.id).toBeDefined();
    expect(created.name).toBe("google-oauth2");
    expect(created.strategy).toBe("google-oauth2");

    const connectionId = created.id!;

    // ----------------------------------------
    // Get
    // ----------------------------------------
    const fetched = await data.connections.get("tenantId", connectionId);
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe("google-oauth2");

    // ----------------------------------------
    // Update
    // ----------------------------------------
    const updated = await data.connections.update("tenantId", connectionId, {
      display_name: "Google Login",
    });
    expect(updated).toBe(true);

    // Verify update
    const fetchedAfterUpdate = await data.connections.get("tenantId", connectionId);
    expect(fetchedAfterUpdate?.display_name).toBe("Google Login");

    // ----------------------------------------
    // List
    // ----------------------------------------
    const list = await data.connections.list("tenantId");
    expect(list.connections.length).toBeGreaterThanOrEqual(1);

    // ----------------------------------------
    // Delete
    // ----------------------------------------
    const deleted = await data.connections.remove("tenantId", connectionId);
    expect(deleted).toBe(true);

    // Verify deletion
    const fetchedAfterDelete = await data.connections.get("tenantId", connectionId);
    expect(fetchedAfterDelete).toBeNull();
  });
});
