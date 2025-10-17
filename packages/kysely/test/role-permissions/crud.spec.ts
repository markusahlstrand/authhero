import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("role permissions adapter", () => {
  let adapters: any;
  let tenant: string;

  beforeEach(async () => {
    const { data } = await getTestServer();
    adapters = data;
    tenant = "t1";

    // Create tenant first (required for foreign key constraints)
    await adapters.tenants.create({
      id: tenant,
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });
  });

  it("should handle empty assignment and removal arrays", async () => {
    // Create a role
    const emptyRole = await adapters.roles.create(tenant, {
      name: "empty-test-role",
      description: "Role for testing empty arrays",
    });

    // Test assigning empty array
    const emptyAssign = await adapters.rolePermissions.assign(
      tenant,
      emptyRole.id,
      [],
    );
    expect(emptyAssign).toBe(true);

    // Test removing empty array
    const emptyRemove = await adapters.rolePermissions.remove(
      tenant,
      emptyRole.id,
      [],
    );
    expect(emptyRemove).toBe(true);

    // Should still have no permissions
    const permissions = await adapters.rolePermissions.list(
      tenant,
      emptyRole.id,
    );
    expect(permissions.length).toBe(0);
  });
});
