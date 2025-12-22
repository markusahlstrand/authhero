import { describe, it, expect, vi, beforeEach } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../helpers/token";
import { getTestServer } from "../helpers/test-server";
import { EntityHookContext } from "../../src/types/Hooks";
import { Role, RoleInsert } from "@authhero/adapter-interfaces";

describe("Entity Hooks", () => {
  describe("Role Entity Hooks", () => {
    it("should call beforeCreate and afterCreate hooks when creating a role", async () => {
      const beforeCreateMock = vi.fn(
        async (ctx: EntityHookContext, data: RoleInsert) => {
          // Can modify the data before creation
          return {
            ...data,
            description: `${data.description || ""} [modified by hook]`,
          };
        },
      );
      const afterCreateMock = vi.fn();

      const { managementApp, env } = await getTestServer({
        entityHooks: {
          roles: {
            beforeCreate: beforeCreateMock,
            afterCreate: afterCreateMock,
          },
        },
      });

      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      // Create a role
      const createResponse = await managementClient.roles.$post(
        {
          json: {
            name: "Test Role",
            description: "Original description",
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

      expect(createResponse.status).toBe(201);
      const createdRole = (await createResponse.json()) as Role;

      // Verify beforeCreate was called with correct context and data
      expect(beforeCreateMock).toHaveBeenCalledTimes(1);
      const beforeCreateCall = beforeCreateMock.mock.calls[0];
      expect(beforeCreateCall[0].tenantId).toBe("tenantId");
      expect(beforeCreateCall[0].adapters).toBeDefined();
      expect(beforeCreateCall[1].name).toBe("Test Role");

      // Verify afterCreate was called with the created entity
      expect(afterCreateMock).toHaveBeenCalledTimes(1);
      const afterCreateCall = afterCreateMock.mock.calls[0];
      expect(afterCreateCall[0].tenantId).toBe("tenantId");
      expect(afterCreateCall[1].name).toBe("Test Role");
      expect(afterCreateCall[1].id).toBeDefined();

      // Verify the hook modified the description
      expect(createdRole.description).toBe(
        "Original description [modified by hook]",
      );
    });

    it("should call beforeUpdate and afterUpdate hooks when updating a role", async () => {
      const beforeUpdateMock = vi.fn(
        async (
          ctx: EntityHookContext,
          id: string,
          data: Partial<RoleInsert>,
        ) => {
          return {
            ...data,
            description: `${data.description || ""} [updated by hook]`,
          };
        },
      );
      const afterUpdateMock = vi.fn();

      const { managementApp, env } = await getTestServer({
        entityHooks: {
          roles: {
            beforeUpdate: beforeUpdateMock,
            afterUpdate: afterUpdateMock,
          },
        },
      });

      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      // First create a role
      const createResponse = await managementClient.roles.$post(
        {
          json: {
            name: "Update Test Role",
            description: "Initial",
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

      expect(createResponse.status).toBe(201);
      const createdRole = (await createResponse.json()) as Role;

      // Update the role
      const updateResponse = await managementClient.roles[":id"].$patch(
        {
          param: { id: createdRole.id },
          json: {
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

      expect(updateResponse.status).toBe(200);
      const updatedRole = (await updateResponse.json()) as Role;

      // Verify beforeUpdate was called
      expect(beforeUpdateMock).toHaveBeenCalledTimes(1);
      const beforeUpdateCall = beforeUpdateMock.mock.calls[0];
      expect(beforeUpdateCall[0].tenantId).toBe("tenantId");
      expect(beforeUpdateCall[1]).toBe(createdRole.id);
      expect(beforeUpdateCall[2].description).toBe("Updated description");

      // Verify afterUpdate was called
      expect(afterUpdateMock).toHaveBeenCalledTimes(1);
      const afterUpdateCall = afterUpdateMock.mock.calls[0];
      expect(afterUpdateCall[0].tenantId).toBe("tenantId");
      expect(afterUpdateCall[1]).toBe(createdRole.id);
      expect(afterUpdateCall[2].name).toBe("Update Test Role");

      // Verify the hook modified the description
      expect(updatedRole.description).toBe(
        "Updated description [updated by hook]",
      );
    });

    it("should call beforeDelete and afterDelete hooks when deleting a role", async () => {
      const beforeDeleteMock = vi.fn();
      const afterDeleteMock = vi.fn();

      const { managementApp, env } = await getTestServer({
        entityHooks: {
          roles: {
            beforeDelete: beforeDeleteMock,
            afterDelete: afterDeleteMock,
          },
        },
      });

      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      // First create a role
      const createResponse = await managementClient.roles.$post(
        {
          json: {
            name: "Delete Test Role",
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

      expect(createResponse.status).toBe(201);
      const createdRole = (await createResponse.json()) as Role;

      // Delete the role
      const deleteResponse = await managementClient.roles[":id"].$delete(
        {
          param: { id: createdRole.id },
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

      expect(deleteResponse.status).toBe(200);

      // Verify beforeDelete was called
      expect(beforeDeleteMock).toHaveBeenCalledTimes(1);
      const beforeDeleteCall = beforeDeleteMock.mock.calls[0];
      expect(beforeDeleteCall[0].tenantId).toBe("tenantId");
      expect(beforeDeleteCall[1]).toBe(createdRole.id);

      // Verify afterDelete was called
      expect(afterDeleteMock).toHaveBeenCalledTimes(1);
      const afterDeleteCall = afterDeleteMock.mock.calls[0];
      expect(afterDeleteCall[0].tenantId).toBe("tenantId");
      expect(afterDeleteCall[1]).toBe(createdRole.id);
    });

    it("should not call hooks when no hooks are configured", async () => {
      const { managementApp, env } = await getTestServer({});

      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      // Create a role without hooks - should work normally
      const createResponse = await managementClient.roles.$post(
        {
          json: {
            name: "No Hook Role",
            description: "Test description",
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

      expect(createResponse.status).toBe(201);
      const createdRole = (await createResponse.json()) as Role;
      expect(createdRole.name).toBe("No Hook Role");
      expect(createdRole.description).toBe("Test description");
    });
  });

  describe("Role Permission Hooks", () => {
    it("should call beforeAssign and afterAssign hooks when assigning permissions", async () => {
      const beforeAssignMock = vi.fn(
        async (ctx: EntityHookContext, roleId: string, permissions: any[]) => {
          return permissions;
        },
      );
      const afterAssignMock = vi.fn();

      const { managementApp, env } = await getTestServer({
        entityHooks: {
          rolePermissions: {
            beforeAssign: beforeAssignMock,
            afterAssign: afterAssignMock,
          },
        },
      });

      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      // Create a resource server first
      const rsResponse = await managementClient["resource-servers"].$post(
        {
          json: {
            identifier: "https://api.example.com",
            name: "Test API",
            scopes: [{ value: "read:data", description: "Read data" }],
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
      expect(rsResponse.status).toBe(201);

      // Create a role
      const roleResponse = await managementClient.roles.$post(
        {
          json: {
            name: "Permission Test Role",
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
      expect(roleResponse.status).toBe(201);
      const role = (await roleResponse.json()) as Role;

      // Assign permissions to the role
      const assignResponse = await managementClient.roles[
        ":id"
      ].permissions.$post(
        {
          param: { id: role.id },
          json: {
            permissions: [
              {
                resource_server_identifier: "https://api.example.com",
                permission_name: "read:data",
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

      expect(assignResponse.status).toBe(201);

      // Verify beforeAssign was called
      expect(beforeAssignMock).toHaveBeenCalledTimes(1);
      const beforeAssignCall = beforeAssignMock.mock.calls[0];
      expect(beforeAssignCall[0].tenantId).toBe("tenantId");
      expect(beforeAssignCall[1]).toBe(role.id);
      expect(beforeAssignCall[2]).toHaveLength(1);
      expect(beforeAssignCall[2][0].permission_name).toBe("read:data");

      // Verify afterAssign was called
      expect(afterAssignMock).toHaveBeenCalledTimes(1);
      const afterAssignCall = afterAssignMock.mock.calls[0];
      expect(afterAssignCall[0].tenantId).toBe("tenantId");
      expect(afterAssignCall[1]).toBe(role.id);
    });

    it("should call beforeRemove and afterRemove hooks when removing permissions", async () => {
      const beforeRemoveMock = vi.fn(
        async (ctx: EntityHookContext, roleId: string, permissions: any[]) => {
          return permissions;
        },
      );
      const afterRemoveMock = vi.fn();

      const { managementApp, env } = await getTestServer({
        entityHooks: {
          rolePermissions: {
            beforeRemove: beforeRemoveMock,
            afterRemove: afterRemoveMock,
          },
        },
      });

      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      // Create a resource server first
      const rsResponse = await managementClient["resource-servers"].$post(
        {
          json: {
            identifier: "https://api2.example.com",
            name: "Test API 2",
            scopes: [{ value: "write:data", description: "Write data" }],
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
      expect(rsResponse.status).toBe(201);

      // Create a role
      const roleResponse = await managementClient.roles.$post(
        {
          json: {
            name: "Remove Permission Test Role",
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
      expect(roleResponse.status).toBe(201);
      const role = (await roleResponse.json()) as Role;

      // Assign permissions first
      await managementClient.roles[":id"].permissions.$post(
        {
          param: { id: role.id },
          json: {
            permissions: [
              {
                resource_server_identifier: "https://api2.example.com",
                permission_name: "write:data",
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

      // Remove permissions from the role
      const removeResponse = await managementClient.roles[
        ":id"
      ].permissions.$delete(
        {
          param: { id: role.id },
          json: {
            permissions: [
              {
                resource_server_identifier: "https://api2.example.com",
                permission_name: "write:data",
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

      expect(removeResponse.status).toBe(200);

      // Verify beforeRemove was called
      expect(beforeRemoveMock).toHaveBeenCalledTimes(1);
      const beforeRemoveCall = beforeRemoveMock.mock.calls[0];
      expect(beforeRemoveCall[0].tenantId).toBe("tenantId");
      expect(beforeRemoveCall[1]).toBe(role.id);
      expect(beforeRemoveCall[2]).toHaveLength(1);
      expect(beforeRemoveCall[2][0].permission_name).toBe("write:data");

      // Verify afterRemove was called
      expect(afterRemoveMock).toHaveBeenCalledTimes(1);
      const afterRemoveCall = afterRemoveMock.mock.calls[0];
      expect(afterRemoveCall[0].tenantId).toBe("tenantId");
      expect(afterRemoveCall[1]).toBe(role.id);
    });
  });
});
