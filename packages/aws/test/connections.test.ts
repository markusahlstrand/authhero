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
    const fetchedAfterUpdate = await data.connections.get(
      "tenantId",
      connectionId,
    );
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
    const fetchedAfterDelete = await data.connections.get(
      "tenantId",
      connectionId,
    );
    expect(fetchedAfterDelete).toBeNull();
  });

  it("returns a next cursor for checkpoint pagination", async () => {
    const { data } = await getTestServer();
    const tenantId = "connections-cursor-tenant";
    for (let i = 0; i < 7; i++) {
      await data.connections.create(tenantId, {
        name: `connection-${i}`,
        strategy: "mock-strategy",
        options: {},
      });
    }

    const seen = new Set<string>();
    let from: string | undefined;
    let pages = 0;
    do {
      const result = await data.connections.list(tenantId, { take: 3, from });
      for (const connection of result.connections) {
        expect(seen.has(connection.id)).toBe(false);
        seen.add(connection.id);
      }
      from = result.next;
      if (++pages > 4) throw new Error("cursor walk did not terminate");
    } while (from);
    expect(seen.size).toBe(7);
  });
});
