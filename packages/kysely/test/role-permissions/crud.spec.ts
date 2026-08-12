import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { assign } from "../../src/role-permissions/assign";

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

  it("should be idempotent when assigning a permission twice", async () => {
    const role = await adapters.roles.create(tenant, {
      name: "reassign-test-role",
      description: "Role for testing duplicate assignment",
    });

    const permission = {
      role_id: role.id,
      resource_server_identifier: "urn:authhero:management",
      permission_name: "read:custom_domains",
    };

    expect(
      await adapters.rolePermissions.assign(tenant, role.id, [permission]),
    ).toBe(true);
    expect(
      await adapters.rolePermissions.assign(tenant, role.id, [permission]),
    ).toBe(true);

    const permissions = await adapters.rolePermissions.list(tenant, role.id);
    expect(permissions.length).toBe(1);
  });

  it("should report success when removing a permission the role does not have", async () => {
    const role = await adapters.roles.create(tenant, {
      name: "absent-permission-role",
      description: "Role for testing removal of an absent permission",
    });

    // The management API turns `false` into a 500, so an absent permission
    // must not read as a failure.
    const removed = await adapters.rolePermissions.remove(tenant, role.id, [
      {
        resource_server_identifier: "urn:authhero:management",
        permission_name: "read:custom_domains",
      },
    ]);

    expect(removed).toBe(true);
  });

  it("should remove only the listed permissions", async () => {
    const role = await adapters.roles.create(tenant, {
      name: "selective-removal-role",
      description: "Role for testing selective removal",
    });

    await adapters.rolePermissions.assign(tenant, role.id, [
      {
        role_id: role.id,
        resource_server_identifier: "urn:authhero:management",
        permission_name: "read:custom_domains",
      },
      {
        role_id: role.id,
        resource_server_identifier: "urn:authhero:management",
        permission_name: "create:custom_domains",
      },
    ]);

    await adapters.rolePermissions.remove(tenant, role.id, [
      {
        resource_server_identifier: "urn:authhero:management",
        permission_name: "read:custom_domains",
      },
    ]);

    const permissions = await adapters.rolePermissions.list(tenant, role.id);
    expect(permissions.map((p: any) => p.permission_name)).toEqual([
      "create:custom_domains",
    ]);
  });

  it("should treat a PlanetScale duplicate-entry error as a no-op", async () => {
    // PlanetScale reports duplicates in the error message only — no
    // ER_DUP_ENTRY on `code` — so the SQLite-backed test server can't cover
    // this path. Stub the insert to reproduce the driver's error shape.
    const planetScaleDb = {
      insertInto: () => ({
        values: () => ({
          execute: async () => {
            throw new Error(
              "target: authhero.-.primary: vttablet: rpc error: code = AlreadyExists desc = Duplicate entry 'sesamy-role-urn:authhero:management-read:custom_domains' for key 'PRIMARY' (errno 1062) (sqlstate 23000)",
            );
          },
        }),
      }),
    };

    const result = await assign(planetScaleDb as never)(
      "sesamy",
      "IBQxjdT6ZbGR2dU8zpdbr",
      [
        {
          role_id: "IBQxjdT6ZbGR2dU8zpdbr",
          resource_server_identifier: "urn:authhero:management",
          permission_name: "read:custom_domains",
        },
      ],
    );

    expect(result).toBe(true);
  });
});
