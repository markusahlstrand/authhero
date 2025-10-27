import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "./helpers/test-server";
import { InviteInsert } from "@authhero/adapter-interfaces";

describe("InvitesAdapter", () => {
  let adapter: any;
  const tenantId = "test-tenant";

  beforeEach(async () => {
    const { data } = await getTestServer();
    adapter = data;
  });

  it("should create an invite", async () => {
    const inviteData: InviteInsert = {
      inviter: {
        name: "John Doe",
      },
      invitee: {
        email: "invitee@example.com",
      },
      client_id: "client_123",
      connection_id: "conn_456",
      app_metadata: {
        role: "admin",
      },
      user_metadata: {
        preferences: "dark_mode",
      },
      roles: ["role_1", "role_2"],
      ttl_sec: 86400, // 1 day
      send_invitation_email: true,
    };

    const invite = await adapter.invites.create(tenantId, inviteData);

    expect(invite).toBeDefined();
    expect(invite.id).toBeDefined();
    expect(invite.id).toMatch(/^inv_/);
    expect(invite.inviter.name).toBe("John Doe");
    expect(invite.invitee.email).toBe("invitee@example.com");
    expect(invite.client_id).toBe("client_123");
    expect(invite.connection_id).toBe("conn_456");
    expect(invite.app_metadata.role).toBe("admin");
    expect(invite.user_metadata.preferences).toBe("dark_mode");
    expect(invite.roles).toEqual(["role_1", "role_2"]);
    expect(invite.ttl_sec).toBe(86400);
    expect(invite.send_invitation_email).toBe(true);
    expect(invite.invitation_url).toBeDefined();
    expect(invite.created_at).toBeDefined();
    expect(invite.expires_at).toBeDefined();
  });

  it("should create an invite with default values", async () => {
    const inviteData: InviteInsert = {
      inviter: {
        name: "Jane Smith",
      },
      invitee: {
        email: "user@example.com",
      },
      client_id: "client_789",
    };

    const invite = await adapter.invites.create(tenantId, inviteData);

    expect(invite).toBeDefined();
    expect(invite.ttl_sec).toBe(604800); // Default 7 days
    expect(invite.send_invitation_email).toBe(true);
    expect(invite.roles).toEqual([]);
    expect(invite.app_metadata).toEqual({});
    expect(invite.user_metadata).toEqual({});
  });

  it("should get an invite by id", async () => {
    const inviteData: InviteInsert = {
      inviter: {
        name: "Test Inviter",
      },
      invitee: {
        email: "test@example.com",
      },
      client_id: "client_123",
    };

    const created = await adapter.invites.create(tenantId, inviteData);
    const retrieved = await adapter.invites.get(tenantId, created.id);

    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(created.id);
    expect(retrieved!.inviter.name).toBe("Test Inviter");
    expect(retrieved!.invitee.email).toBe("test@example.com");
  });

  it("should return null when getting non-existent invite", async () => {
    const retrieved = await adapter.invites.get(tenantId, "inv_nonexistent");
    expect(retrieved).toBeNull();
  });

  it("should list invites", async () => {
    const invite1: InviteInsert = {
      inviter: { name: "Inviter 1" },
      invitee: { email: "user1@example.com" },
      client_id: "client_1",
    };
    const invite2: InviteInsert = {
      inviter: { name: "Inviter 2" },
      invitee: { email: "user2@example.com" },
      client_id: "client_2",
    };

    await adapter.invites.create(tenantId, invite1);
    await adapter.invites.create(tenantId, invite2);

    const result = await adapter.invites.list(tenantId);

    expect(result.invites).toHaveLength(2);
    expect(result.invites.map((i: any) => i.invitee.email)).toContain(
      "user1@example.com",
    );
    expect(result.invites.map((i: any) => i.invitee.email)).toContain(
      "user2@example.com",
    );
  });

  it("should list invites with pagination", async () => {
    // Create 5 invites
    for (let i = 1; i <= 5; i++) {
      await adapter.invites.create(tenantId, {
        inviter: { name: `Inviter ${i}` },
        invitee: { email: `user${i}@example.com` },
        client_id: "client_123",
      });
    }

    const page1 = await adapter.invites.list(tenantId, {
      per_page: 2,
      page: 1,
    });
    expect(page1.invites).toHaveLength(2);
    expect(page1.limit).toBe(2);

    const page2 = await adapter.invites.list(tenantId, {
      per_page: 2,
      page: 2,
    });
    expect(page2.invites).toHaveLength(2);
    expect(page2.start).toBe(2);
  });

  it("should update an invite", async () => {
    const inviteData: InviteInsert = {
      inviter: { name: "Original Inviter" },
      invitee: { email: "original@example.com" },
      client_id: "client_123",
      roles: ["role_1"],
    };

    const created = await adapter.invites.create(tenantId, inviteData);
    const updated = await adapter.invites.update(tenantId, created.id, {
      inviter: { name: "Updated Inviter" },
      roles: ["role_1", "role_2", "role_3"],
      app_metadata: { updated: true },
    });

    expect(updated).toBe(true);

    const retrieved = await adapter.invites.get(tenantId, created.id);
    expect(retrieved!.inviter.name).toBe("Updated Inviter");
    expect(retrieved!.roles).toEqual(["role_1", "role_2", "role_3"]);
    expect(retrieved!.app_metadata.updated).toBe(true);
  });

  it("should update invite ttl_sec and recalculate expires_at", async () => {
    const inviteData: InviteInsert = {
      inviter: { name: "Test Inviter" },
      invitee: { email: "test@example.com" },
      client_id: "client_123",
      ttl_sec: 86400, // 1 day
    };

    const created = await adapter.invites.create(tenantId, inviteData);
    const originalExpiresAt = new Date(created.expires_at);

    // Wait a bit to ensure time difference
    await new Promise((resolve) => setTimeout(resolve, 10));

    const updated = await adapter.invites.update(tenantId, created.id, {
      ttl_sec: 172800, // 2 days
    });

    expect(updated).toBe(true);

    const retrieved = await adapter.invites.get(tenantId, created.id);
    const newExpiresAt = new Date(retrieved!.expires_at);

    // The new expires_at should be different from the original
    expect(newExpiresAt.getTime()).not.toBe(originalExpiresAt.getTime());
  });

  it("should return true when updating non-existent fields (no-op)", async () => {
    const inviteData: InviteInsert = {
      inviter: { name: "Test Inviter" },
      invitee: { email: "test@example.com" },
      client_id: "client_123",
    };

    const created = await adapter.invites.create(tenantId, inviteData);
    const updated = await adapter.invites.update(tenantId, created.id, {});

    expect(updated).toBe(true);
  });

  it("should remove an invite", async () => {
    const inviteData: InviteInsert = {
      inviter: { name: "To Be Deleted" },
      invitee: { email: "delete@example.com" },
      client_id: "client_123",
    };

    const created = await adapter.invites.create(tenantId, inviteData);
    const removed = await adapter.invites.remove(tenantId, created.id);

    expect(removed).toBe(true);

    const retrieved = await adapter.invites.get(tenantId, created.id);
    expect(retrieved).toBeNull();
  });

  it("should return false when removing non-existent invite", async () => {
    const removed = await adapter.invites.remove(tenantId, "inv_nonexistent");
    expect(removed).toBe(false);
  });

  it("should handle invites with optional fields as null", async () => {
    const inviteData: InviteInsert = {
      inviter: { name: "Test Inviter" },
      invitee: { email: "test@example.com" },
      client_id: "client_123",
      connection_id: undefined,
    };

    const invite = await adapter.invites.create(tenantId, inviteData);

    expect(invite).toBeDefined();
    expect(invite.connection_id).toBeUndefined();
  });

  it("should isolate invites by tenant", async () => {
    const tenant1 = "tenant_1";
    const tenant2 = "tenant_2";

    const inviteData: InviteInsert = {
      inviter: { name: "Test Inviter" },
      invitee: { email: "test@example.com" },
      client_id: "client_123",
    };

    const invite1 = await adapter.invites.create(tenant1, inviteData);
    const invite2 = await adapter.invites.create(tenant2, inviteData);

    // Check tenant 1 can only see their invite
    const tenant1Invites = await adapter.invites.list(tenant1);
    expect(tenant1Invites.invites).toHaveLength(1);
    expect(tenant1Invites.invites[0].id).toBe(invite1.id);

    // Check tenant 2 can only see their invite
    const tenant2Invites = await adapter.invites.list(tenant2);
    expect(tenant2Invites.invites).toHaveLength(1);
    expect(tenant2Invites.invites[0].id).toBe(invite2.id);

    // Check cross-tenant access returns null
    const crossTenantGet = await adapter.invites.get(tenant1, invite2.id);
    expect(crossTenantGet).toBeNull();
  });

  it("should handle complex metadata structures", async () => {
    const inviteData: InviteInsert = {
      inviter: { name: "Complex Inviter" },
      invitee: { email: "complex@example.com" },
      client_id: "client_123",
      app_metadata: {
        nested: {
          structure: {
            with: ["array", "values"],
            and: { object: "properties" },
          },
        },
        numbers: 42,
        boolean: true,
      },
      user_metadata: {
        preferences: {
          theme: "dark",
          language: "en",
        },
      },
    };

    const invite = await adapter.invites.create(tenantId, inviteData);
    const retrieved = await adapter.invites.get(tenantId, invite.id);

    expect(retrieved!.app_metadata.nested.structure.with).toEqual([
      "array",
      "values",
    ]);
    expect(retrieved!.app_metadata.nested.structure.and.object).toBe(
      "properties",
    );
    expect(retrieved!.app_metadata.numbers).toBe(42);
    expect(retrieved!.app_metadata.boolean).toBe(true);
    expect(retrieved!.user_metadata.preferences.theme).toBe("dark");
  });
});
