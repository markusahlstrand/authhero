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

  it("returns a next cursor for checkpoint pagination", async () => {
    const { data } = await getTestServer();
    const tenantId = "roles-cursor-tenant";
    for (let i = 0; i < 7; i++) {
      await data.roles.create(tenantId, { name: `role-${i}` });
    }

    const seen = new Set<string>();
    let from: string | undefined;
    let pages = 0;
    do {
      const result = await data.roles.list(tenantId, { take: 3, from });
      for (const role of result.roles) {
        expect(seen.has(role.id)).toBe(false);
        seen.add(role.id);
      }
      from = result.next;
      if (++pages > 4) throw new Error("role cursor walk did not terminate");
    } while (from);
    expect(seen.size).toBe(7);
  });

  it("walks role permissions via the checkpoint cursor", async () => {
    const { data } = await getTestServer();
    const tenantId = "role-permissions-cursor-tenant";
    const role = await data.roles.create(tenantId, { name: "role" });
    await data.rolePermissions.assign(
      tenantId,
      role.id,
      Array.from({ length: 7 }, (_, i) => ({
        role_id: role.id,
        resource_server_identifier: `https://api-${i % 2}.example.com`,
        permission_name: `perm:${i}`,
      })),
    );

    const seen = new Set<string>();
    let from: string | undefined;
    let pages = 0;
    do {
      const result = await data.rolePermissions.listCheckpoint!(
        tenantId,
        role.id,
        { take: 3, from },
      );
      for (const p of result.permissions) {
        const key = `${p.resource_server_identifier}|${p.permission_name}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
      from = result.next;
      // DynamoDB may hand back a final cursor that points at an empty page.
      if (++pages > 4) throw new Error("cursor walk did not terminate");
    } while (from);
    expect(seen.size).toBe(7);
  });
});
