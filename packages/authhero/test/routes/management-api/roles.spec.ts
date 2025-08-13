import { describe, it, expect, beforeEach } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import { env } from "hono/adapter";

describe("roles", () => {
  let managementClient: any;
  let token: string;

  beforeEach(async () => {
    const { managementApp, env } = await getTestServer();
    managementClient = testClient(managementApp, env);
    token = await getAdminToken();
  });

  it("should support CRUD operations", async () => {
    // --------------------------------------------
    // CREATE
    // --------------------------------------------
    const createRoleResponse = await managementClient.roles.$post(
      {
        json: {
          name: "test-role",
          description: "A test role for CRUD operations",
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(createRoleResponse.status).toBe(201);
    const createdRole = await createRoleResponse.json();

    const { created_at, updated_at, id, ...rest } = createdRole;

    expect(rest).toEqual({
      name: "test-role",
      description: "A test role for CRUD operations",
    });
    expect(created_at).toBeTypeOf("string");
    expect(updated_at).toBeTypeOf("string");
    expect(id).toBeTypeOf("string");

    // --------------------------------------------
    // GET by ID
    // --------------------------------------------
    const getRoleResponse = await managementClient.roles[":id"].$get(
      {
        param: {
          id,
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(getRoleResponse.status).toBe(200);
    const fetchedRole = await getRoleResponse.json();
    expect(fetchedRole.id).toBe(id);
    expect(fetchedRole.name).toBe("test-role");

    // --------------------------------------------
    // PATCH (Update)
    // --------------------------------------------
    const patchRoleResponse = await managementClient.roles[":id"].$patch(
      {
        param: {
          id,
        },
        json: {
          name: "updated-test-role",
          description: "Updated description",
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(patchRoleResponse.status).toBe(200);
    const patchedRole = await patchRoleResponse.json();
    expect(patchedRole.name).toBe("updated-test-role");
    expect(patchedRole.description).toBe("Updated description");

    // --------------------------------------------
    // LIST
    // --------------------------------------------
    const listRolesResponse = await managementClient.roles.$get(
      {
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(listRolesResponse.status).toBe(200);
    const rolesList = await listRolesResponse.json();
    expect(Array.isArray(rolesList)).toBe(true);
    expect(rolesList.length).toBeGreaterThan(0);

    // Should find our created role
    const ourRole = rolesList.find((role: any) => role.id === id);
    expect(ourRole).toBeDefined();
    expect(ourRole.name).toBe("updated-test-role");

    // --------------------------------------------
    // LIST with include_totals
    // --------------------------------------------
    const listRolesWithTotalsResponse = await managementClient.roles.$get(
      {
        query: {
          include_totals: "true",
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(listRolesWithTotalsResponse.status).toBe(200);
    const rolesListWithTotals = await listRolesWithTotalsResponse.json();
    expect(rolesListWithTotals).toHaveProperty("roles");
    expect(rolesListWithTotals).toHaveProperty("start");
    expect(rolesListWithTotals).toHaveProperty("limit");
    expect(rolesListWithTotals).toHaveProperty("length");
    expect(Array.isArray(rolesListWithTotals.roles)).toBe(true);

    // --------------------------------------------
    // DELETE
    // --------------------------------------------
    const deleteRoleResponse = await managementClient.roles[":id"].$delete(
      {
        param: {
          id,
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(deleteRoleResponse.status).toBe(200);

    // --------------------------------------------
    // GET 404 after deletion
    // --------------------------------------------
    const get404Response = await managementClient.roles[":id"].$get(
      {
        param: {
          id,
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(get404Response.status).toBe(404);
  });

  it.only("should handle role permissions management", async () => {
    // First create a role
    const createRoleResponse = await managementClient.roles.$post(
      {
        json: {
          name: "permissions-test-role",
          description: "Role for testing permissions",
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(createRoleResponse.status).toBe(201);
    const role = await createRoleResponse.json();
    const roleId = role.id;

    const tmp = await managementClient.roles[":id"].$get(
      {
        param: {
          id: roleId,
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    console.log("tmp:", tmp.status);

    // --------------------------------------------
    // GET role permissions (initially empty)
    // --------------------------------------------
    const getPermissionsResponse = await managementClient.roles[
      ":id"
    ].permissions.$get(
      {
        param: {
          id: roleId,
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(getPermissionsResponse.status).toBe(200);
    const initialPermissions = await getPermissionsResponse.json();
    expect(Array.isArray(initialPermissions)).toBe(true);
    expect(initialPermissions.length).toBe(0);

    // --------------------------------------------
    // ADD permissions to role
    // --------------------------------------------
    const uniqueResourceServer = `https://api-${Date.now()}.example.com`;
    const addPermissionsResponse = await managementClient.roles[
      ":id"
    ].permissions.$post(
      {
        param: {
          id: roleId,
        },
        json: {
          permissions: [
            {
              permission_name: "read:users",
              resource_server_identifier: uniqueResourceServer,
            },
            {
              permission_name: "write:users",
              resource_server_identifier: uniqueResourceServer,
            },
          ],
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(addPermissionsResponse.status).toBe(201);
    const addResult = await addPermissionsResponse.json();
    expect(addResult.message).toBe("Permissions assigned successfully");

    // --------------------------------------------
    // GET role permissions (should now have 2)
    // --------------------------------------------
    const getPermissionsAfterAddResponse = await managementClient.roles[
      ":id"
    ].permissions.$get(
      {
        param: {
          id: roleId,
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(getPermissionsAfterAddResponse.status).toBe(200);
    if (getPermissionsAfterAddResponse.status !== 200) {
      console.error(
        "GET role permissions failed:",
        await getPermissionsAfterAddResponse.text(),
      );
    }
    const permissionsAfterAdd = await getPermissionsAfterAddResponse.json();
    expect(Array.isArray(permissionsAfterAdd)).toBe(true);
    expect(permissionsAfterAdd.length).toBe(2);

    // Verify the permissions have the correct structure
    const readPermission = permissionsAfterAdd.find(
      (p: any) =>
        p.permission_name === "read:users" &&
        p.resource_server_identifier === uniqueResourceServer,
    );
    const writePermission = permissionsAfterAdd.find(
      (p: any) =>
        p.permission_name === "write:users" &&
        p.resource_server_identifier === uniqueResourceServer,
    );

    expect(readPermission).toBeDefined();
    expect(writePermission).toBeDefined();
    expect(readPermission.resource_server_identifier).toBe(
      uniqueResourceServer,
    );
    expect(writePermission.resource_server_identifier).toBe(
      uniqueResourceServer,
    );

    // --------------------------------------------
    // REMOVE one permission from role
    // --------------------------------------------
    const removePermissionsResponse = await managementClient.roles[
      ":id"
    ].permissions.$delete(
      {
        param: {
          id: roleId,
        },
        json: {
          permissions: [
            {
              permission_name: "write:users",
              resource_server_identifier: uniqueResourceServer,
            },
          ],
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(removePermissionsResponse.status).toBe(200);
    const removeResult = await removePermissionsResponse.json();
    expect(removeResult.message).toBe("Permissions removed successfully");

    // --------------------------------------------
    // GET role permissions (should now have 1)
    // --------------------------------------------
    const getPermissionsAfterRemoveResponse = await managementClient.roles[
      ":id"
    ].permissions.$get(
      {
        param: {
          id: roleId,
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(getPermissionsAfterRemoveResponse.status).toBe(200);
    const permissionsAfterRemove =
      await getPermissionsAfterRemoveResponse.json();
    expect(Array.isArray(permissionsAfterRemove)).toBe(true);
    console.log(
      "Permissions after remove:",
      JSON.stringify(permissionsAfterRemove, null, 2),
    );
    expect(permissionsAfterRemove.length).toBe(1);
    expect(permissionsAfterRemove[0].permission_name).toBe("read:users");
    expect(permissionsAfterRemove[0].resource_server_identifier).toBe(
      uniqueResourceServer,
    );

    // Clean up - delete the role
    await managementClient.roles[":id"].$delete(
      {
        param: {
          id: roleId,
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
  });

  it("should return 404 for non-existent role operations", async () => {
    const nonExistentId = "non-existent-role-id";

    // GET non-existent role
    const getResponse = await managementClient.roles[":id"].$get(
      {
        param: {
          id: nonExistentId,
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(getResponse.status).toBe(404);

    // PATCH non-existent role
    const patchResponse = await managementClient.roles[":id"].$patch(
      {
        param: {
          id: nonExistentId,
        },
        json: {
          name: "updated-name",
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(patchResponse.status).toBe(404);

    // DELETE non-existent role
    const deleteResponse = await managementClient.roles[":id"].$delete(
      {
        param: {
          id: nonExistentId,
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(deleteResponse.status).toBe(404);

    // GET permissions for non-existent role
    const getPermissionsResponse = await managementClient.roles[
      ":id"
    ].permissions.$get(
      {
        param: {
          id: nonExistentId,
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(getPermissionsResponse.status).toBe(404);

    // ADD permissions to non-existent role
    const addPermissionsResponse = await managementClient.roles[
      ":id"
    ].permissions.$post(
      {
        param: {
          id: nonExistentId,
        },
        json: {
          permissions: [
            {
              permission_name: "read:test",
              resource_server_identifier: "https://api.example.com",
            },
          ],
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(addPermissionsResponse.status).toBe(404);

    // REMOVE permissions from non-existent role
    const removePermissionsResponse = await managementClient.roles[
      ":id"
    ].permissions.$delete(
      {
        param: {
          id: nonExistentId,
        },
        json: {
          permissions: [
            {
              permission_name: "read:test",
              resource_server_identifier: "https://api.example.com",
            },
          ],
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(removePermissionsResponse.status).toBe(404);
  });
});
