import { describe, expect, it, afterEach } from "vitest";
import { getTestServer, teardownTestServer } from "./helpers/test-server";

describe("sessions", () => {
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

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // ----------------------------------------
    // Create
    // ----------------------------------------
    const created = await data.sessions.create("tenantId", {
      id: "session-1",
      user_id: "user-1",
      login_session_id: "login-session-1",
      expires_at: expiresAt,
      device: {
        last_ip: "127.0.0.1",
        initial_ip: "127.0.0.1",
        initial_user_agent: "Test Agent",
        last_user_agent: "Test Agent",
        initial_asn: "",
        last_asn: "",
      },
      clients: ["client-1"],
    });

    expect(created.id).toBe("session-1");
    expect(created.user_id).toBe("user-1");

    // ----------------------------------------
    // Get
    // ----------------------------------------
    const fetched = await data.sessions.get("tenantId", "session-1");
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe("session-1");
    expect(fetched?.user_id).toBe("user-1");

    // ----------------------------------------
    // Update
    // ----------------------------------------
    const newUsedAt = new Date().toISOString();
    const updated = await data.sessions.update("tenantId", "session-1", {
      used_at: newUsedAt,
    });
    expect(updated).toBe(true);

    // Verify update
    const fetchedAfterUpdate = await data.sessions.get("tenantId", "session-1");
    expect(fetchedAfterUpdate?.used_at).toBe(newUsedAt);

    // ----------------------------------------
    // Delete
    // ----------------------------------------
    const deleted = await data.sessions.remove("tenantId", "session-1");
    expect(deleted).toBe(true);

    // Verify deletion
    const fetchedAfterDelete = await data.sessions.get("tenantId", "session-1");
    expect(fetchedAfterDelete).toBeNull();
  });

  it("should return null for non-existent session", async () => {
    const { data } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    const result = await data.sessions.get("tenantId", "non-existent");
    expect(result).toBeNull();
  });
});
