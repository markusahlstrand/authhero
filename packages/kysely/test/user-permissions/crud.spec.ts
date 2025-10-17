import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("user permissions adapter", () => {
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

  it("should assign, list and remove permissions for a user", async () => {
    // First, create a resource server to work with
    const resourceServer = await adapters.resourceServers.create(tenant, {
      id: "https://api.example.com/",
      name: "My API",
      identifier: "https://api.example.com/",
      scopes: [
        { value: "read:bar", description: "Read bar" },
        { value: "write:bar", description: "Write bar" },
        { value: "delete:bar", description: "Delete bar" },
      ],
    });

    expect(resourceServer.name).toBe("My API");

    // Create a user
    const user = await adapters.users.create(tenant, {
      user_id: "test-user",
      email: "test@example.com",
      connection: "Username-Password-Authentication",
      provider: "auth0",
    });

    expect(user.user_id).toBe("test-user");

    // Initially, user should have no permissions
    const initialPermissions = await adapters.userPermissions.list(
      tenant,
      "test-user",
    );
    expect(initialPermissions.length).toBe(0);

    // Create permissions for the user
    const created1 = await adapters.userPermissions.create(
      tenant,
      "test-user",
      {
        resource_server_identifier: "https://api.example.com/",
        permission_name: "read:bar",
      },
    );

    const created2 = await adapters.userPermissions.create(
      tenant,
      "test-user",
      {
        resource_server_identifier: "https://api.example.com/",
        permission_name: "write:bar",
      },
    );

    expect(created1).toBe(true);
    expect(created2).toBe(true);

    // List permissions for the user
    const permissions = await adapters.userPermissions.list(
      tenant,
      "test-user",
    );
    expect(permissions.length).toBe(2);

    // Check that permissions include the resource server name
    const readPermission = permissions.find(
      (p) => p.permission_name === "read:bar",
    );
    expect(readPermission).toBeDefined();
    expect(readPermission!.resource_server_name).toBe("My API");
    expect(readPermission!.user_id).toBe("test-user");
    expect(readPermission!.resource_server_identifier).toBe(
      "https://api.example.com/",
    );

    const writePermission = permissions.find(
      (p) => p.permission_name === "write:bar",
    );
    expect(writePermission).toBeDefined();
    expect(writePermission!.resource_server_name).toBe("My API");

    // Test creating duplicate permissions (should handle gracefully)
    const duplicateCreate = await adapters.userPermissions.create(
      tenant,
      "test-user",
      {
        resource_server_identifier: "https://api.example.com/",
        permission_name: "read:bar", // This already exists
      },
    );
    // Should still succeed (idempotent operation)
    expect(duplicateCreate).toBe(true);

    // Should still have only 2 permissions
    const permissionsAfterDuplicate = await adapters.userPermissions.list(
      tenant,
      "test-user",
    );

    expect(permissionsAfterDuplicate.length).toBe(2);

    // Add a third permission
    const createThird = await adapters.userPermissions.create(
      tenant,
      "test-user",
      {
        resource_server_identifier: "https://api.example.com/",
        permission_name: "delete:bar",
      },
    );
    expect(createThird).toBe(true);

    const permissionsWithThird = await adapters.userPermissions.list(
      tenant,
      "test-user",
    );
    expect(permissionsWithThird.length).toBe(3);

    // Remove one permission
    const removed = await adapters.userPermissions.remove(tenant, "test-user", {
      resource_server_identifier: "https://api.example.com/",
      permission_name: "write:bar",
    });

    expect(removed).toBe(true);

    // Verify two permissions remain
    const remainingPermissions = await adapters.userPermissions.list(
      tenant,
      "test-user",
    );
    expect(remainingPermissions.length).toBe(2);
    expect(
      remainingPermissions.some((p) => p.permission_name === "read:bar"),
    ).toBe(true);
    expect(
      remainingPermissions.some((p) => p.permission_name === "delete:bar"),
    ).toBe(true);
    expect(
      remainingPermissions.some((p) => p.permission_name === "write:bar"),
    ).toBe(false);

    // Remove multiple permissions
    const removedRead = await adapters.userPermissions.remove(
      tenant,
      "test-user",
      {
        resource_server_identifier: "https://api.example.com/",
        permission_name: "read:bar",
      },
    );

    const removedDelete = await adapters.userPermissions.remove(
      tenant,
      "test-user",
      {
        resource_server_identifier: "https://api.example.com/",
        permission_name: "delete:bar",
      },
    );

    expect(removedRead).toBe(true);
    expect(removedDelete).toBe(true);

    // Should have no permissions left
    const finalPermissions = await adapters.userPermissions.list(
      tenant,
      "test-user",
    );
    expect(finalPermissions.length).toBe(0);
  });

  it("should handle removing non-existent permissions gracefully", async () => {
    // Create a user
    await adapters.users.create(tenant, {
      user_id: "empty-test-user",
      email: "empty-test@example.com",
      connection: "Username-Password-Authentication",
      provider: "auth0",
    });

    // Test removing non-existent permission (should not throw error)
    const removeNonExistent = await adapters.userPermissions.remove(
      tenant,
      "empty-test-user",
      {
        resource_server_identifier: "https://api.example.com/",
        permission_name: "non-existent",
      },
    );
    expect(removeNonExistent).toBe(true);

    // Should still have no permissions
    const permissions = await adapters.userPermissions.list(
      tenant,
      "empty-test-user",
    );
    expect(permissions.length).toBe(0);
  });

  it("should handle permissions for different resource servers", async () => {
    // Create multiple resource servers
    await adapters.resourceServers.create(tenant, {
      id: "https://api1.example.com/",
      name: "API 1",
      identifier: "https://api1.example.com/",
      scopes: [{ value: "read:api1", description: "Read API 1" }],
    });

    await adapters.resourceServers.create(tenant, {
      id: "https://api2.example.com/",
      name: "API 2",
      identifier: "https://api2.example.com/",
      scopes: [{ value: "read:api2", description: "Read API 2" }],
    });

    // Create a user
    await adapters.users.create(tenant, {
      user_id: "multi-api-user",
      email: "multi-api@example.com",
      connection: "Username-Password-Authentication",
      provider: "auth0",
    });

    // Create permissions from different resource servers
    const created1 = await adapters.userPermissions.create(
      tenant,
      "multi-api-user",
      {
        resource_server_identifier: "https://api1.example.com/",
        permission_name: "read:api1",
      },
    );

    const created2 = await adapters.userPermissions.create(
      tenant,
      "multi-api-user",
      {
        resource_server_identifier: "https://api2.example.com/",
        permission_name: "read:api2",
      },
    );

    expect(created1).toBe(true);
    expect(created2).toBe(true);

    const permissions = await adapters.userPermissions.list(
      tenant,
      "multi-api-user",
    );
    expect(permissions.length).toBe(2);

    const api1Permission = permissions.find(
      (p) => p.resource_server_identifier === "https://api1.example.com/",
    );
    expect(api1Permission!.resource_server_name).toBe("API 1");

    const api2Permission = permissions.find(
      (p) => p.resource_server_identifier === "https://api2.example.com/",
    );
    expect(api2Permission!.resource_server_name).toBe("API 2");
  });

  it("should handle permissions for multiple users independently", async () => {
    // Create a resource server
    await adapters.resourceServers.create(tenant, {
      id: "https://shared-api.example.com/",
      name: "Shared API",
      identifier: "https://shared-api.example.com/",
      scopes: [
        { value: "read:shared", description: "Read shared" },
        { value: "write:shared", description: "Write shared" },
      ],
    });

    // Create two users
    await adapters.users.create(tenant, {
      user_id: "user1",
      email: "user1@example.com",
      connection: "Username-Password-Authentication",
      provider: "auth0",
    });

    await adapters.users.create(tenant, {
      user_id: "user2",
      email: "user2@example.com",
      connection: "Username-Password-Authentication",
      provider: "auth0",
    });

    // Create different permissions for each user
    await adapters.userPermissions.create(tenant, "user1", {
      resource_server_identifier: "https://shared-api.example.com/",
      permission_name: "read:shared",
    });

    await adapters.userPermissions.create(tenant, "user2", {
      resource_server_identifier: "https://shared-api.example.com/",
      permission_name: "write:shared",
    });

    // Verify each user has only their assigned permissions
    const user1Permissions = await adapters.userPermissions.list(
      tenant,
      "user1",
    );
    expect(user1Permissions.length).toBe(1);
    expect(user1Permissions[0].permission_name).toBe("read:shared");

    const user2Permissions = await adapters.userPermissions.list(
      tenant,
      "user2",
    );
    expect(user2Permissions.length).toBe(1);
    expect(user2Permissions[0].permission_name).toBe("write:shared");

    // Remove permission from user1, should not affect user2
    await adapters.userPermissions.remove(tenant, "user1", {
      resource_server_identifier: "https://shared-api.example.com/",
      permission_name: "read:shared",
    });

    const user1FinalPermissions = await adapters.userPermissions.list(
      tenant,
      "user1",
    );
    expect(user1FinalPermissions.length).toBe(0);

    const user2FinalPermissions = await adapters.userPermissions.list(
      tenant,
      "user2",
    );
    expect(user2FinalPermissions.length).toBe(1);
    expect(user2FinalPermissions[0].permission_name).toBe("write:shared");
  });
});
