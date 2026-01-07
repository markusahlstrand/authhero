import { describe, it, expect, vi, beforeEach } from "vitest";
import { DataAdapters } from "@authhero/adapter-interfaces";
import { addEntityHooks } from "../../src/helpers/entity-hooks-wrapper";

describe("addEntityHooks", () => {
  // Create mock adapters with all required methods
  function createMockAdapters(): DataAdapters {
    return {
      roles: {
        create: vi.fn().mockResolvedValue({ id: "role-1", name: "Test Role" }),
        update: vi
          .fn()
          .mockResolvedValue({ id: "role-1", name: "Updated Role" }),
        remove: vi.fn().mockResolvedValue(true),
        get: vi.fn().mockResolvedValue({ id: "role-1", name: "Test Role" }),
        list: vi.fn().mockResolvedValue({ data: [], start: 0, total: 0 }),
      },
      resourceServers: {
        create: vi.fn().mockResolvedValue({ id: "rs-1", identifier: "api" }),
        update: vi.fn().mockResolvedValue({ id: "rs-1", identifier: "api" }),
        remove: vi.fn().mockResolvedValue(true),
        get: vi.fn().mockResolvedValue({ id: "rs-1", identifier: "api" }),
        list: vi.fn().mockResolvedValue({ data: [], start: 0, total: 0 }),
      },
      connections: {
        create: vi.fn().mockResolvedValue({ id: "conn-1", name: "connection" }),
        update: vi.fn().mockResolvedValue({ id: "conn-1", name: "connection" }),
        remove: vi.fn().mockResolvedValue(true),
        get: vi.fn().mockResolvedValue({ id: "conn-1", name: "connection" }),
        list: vi.fn().mockResolvedValue({ data: [], start: 0, total: 0 }),
      },
      rolePermissions: {
        assign: vi.fn().mockResolvedValue(true),
        remove: vi.fn().mockResolvedValue(true),
        list: vi.fn().mockResolvedValue({ data: [], start: 0, total: 0 }),
      },
      tenants: {
        create: vi.fn().mockResolvedValue({ id: "tenant-1", name: "Tenant" }),
        update: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(true),
        get: vi.fn().mockResolvedValue({ id: "tenant-1", name: "Tenant" }),
        list: vi.fn().mockResolvedValue({ data: [], start: 0, total: 0 }),
      },
    } as unknown as DataAdapters;
  }

  describe("returns data unchanged when no hooks configured", () => {
    it("should return the same adapters when entityHooks is undefined", () => {
      const mockAdapters = createMockAdapters();
      const result = addEntityHooks(mockAdapters, {
        tenantId: "test-tenant",
        entityHooks: undefined,
      });

      expect(result).toBe(mockAdapters);
    });

    it("should return wrapped adapters when entityHooks is empty object", () => {
      const mockAdapters = createMockAdapters();
      const result = addEntityHooks(mockAdapters, {
        tenantId: "test-tenant",
        entityHooks: {},
      });

      // Should still return an object (not the same reference since we wrap)
      expect(result).toBeDefined();
    });
  });

  describe("roles hooks", () => {
    it("should call beforeCreate and return modified data", async () => {
      const mockAdapters = createMockAdapters();
      const beforeCreate = vi.fn().mockImplementation(async (ctx, data) => ({
        ...data,
        description: "modified",
      }));

      const wrapped = addEntityHooks(mockAdapters, {
        tenantId: "test-tenant",
        entityHooks: {
          roles: [{ beforeCreate }],
        },
      });

      await wrapped.roles.create("test-tenant", { name: "Test" });

      expect(beforeCreate).toHaveBeenCalledTimes(1);
      expect(beforeCreate).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "test-tenant" }),
        { name: "Test" },
      );
      expect(mockAdapters.roles.create).toHaveBeenCalledWith("test-tenant", {
        name: "Test",
        description: "modified",
      });
    });

    it("should call afterCreate with the created entity", async () => {
      const mockAdapters = createMockAdapters();
      const afterCreate = vi.fn();

      const wrapped = addEntityHooks(mockAdapters, {
        tenantId: "test-tenant",
        entityHooks: {
          roles: [{ afterCreate }],
        },
      });

      await wrapped.roles.create("test-tenant", { name: "Test" });

      expect(afterCreate).toHaveBeenCalledTimes(1);
      expect(afterCreate).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "test-tenant" }),
        { id: "role-1", name: "Test Role" },
      );
    });

    it("should call beforeUpdate and return modified data", async () => {
      const mockAdapters = createMockAdapters();
      const beforeUpdate = vi
        .fn()
        .mockImplementation(async (ctx, id, data) => ({
          ...data,
          description: "updated by hook",
        }));

      const wrapped = addEntityHooks(mockAdapters, {
        tenantId: "test-tenant",
        entityHooks: {
          roles: [{ beforeUpdate }],
        },
      });

      await wrapped.roles.update("test-tenant", "role-1", { name: "Updated" });

      expect(beforeUpdate).toHaveBeenCalledTimes(1);
      expect(beforeUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "test-tenant" }),
        "role-1",
        { name: "Updated" },
      );
      expect(mockAdapters.roles.update).toHaveBeenCalledWith(
        "test-tenant",
        "role-1",
        { name: "Updated", description: "updated by hook" },
      );
    });

    it("should call afterUpdate with the updated entity", async () => {
      const mockAdapters = createMockAdapters();
      const afterUpdate = vi.fn();

      const wrapped = addEntityHooks(mockAdapters, {
        tenantId: "test-tenant",
        entityHooks: {
          roles: [{ afterUpdate }],
        },
      });

      await wrapped.roles.update("test-tenant", "role-1", { name: "Updated" });

      expect(afterUpdate).toHaveBeenCalledTimes(1);
      expect(afterUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "test-tenant" }),
        "role-1",
        { id: "role-1", name: "Updated Role" },
      );
    });

    it("should call beforeDelete and afterDelete", async () => {
      const mockAdapters = createMockAdapters();
      const beforeDelete = vi.fn();
      const afterDelete = vi.fn();

      const wrapped = addEntityHooks(mockAdapters, {
        tenantId: "test-tenant",
        entityHooks: {
          roles: [{ beforeDelete, afterDelete }],
        },
      });

      await wrapped.roles.remove("test-tenant", "role-1");

      expect(beforeDelete).toHaveBeenCalledTimes(1);
      expect(beforeDelete).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "test-tenant" }),
        "role-1",
      );
      expect(afterDelete).toHaveBeenCalledTimes(1);
      expect(afterDelete).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "test-tenant" }),
        "role-1",
      );
    });

    it("should not call afterDelete when remove returns false", async () => {
      const mockAdapters = createMockAdapters();
      (mockAdapters.roles.remove as ReturnType<typeof vi.fn>).mockResolvedValue(
        false,
      );
      const afterDelete = vi.fn();

      const wrapped = addEntityHooks(mockAdapters, {
        tenantId: "test-tenant",
        entityHooks: {
          roles: [{ afterDelete }],
        },
      });

      await wrapped.roles.remove("test-tenant", "role-1");

      expect(afterDelete).not.toHaveBeenCalled();
    });
  });

  describe("hook chaining", () => {
    it("should chain multiple beforeCreate hooks, passing result to next", async () => {
      const mockAdapters = createMockAdapters();
      const hook1 = vi.fn().mockImplementation(async (ctx, data) => ({
        ...data,
        step1: true,
      }));
      const hook2 = vi.fn().mockImplementation(async (ctx, data) => ({
        ...data,
        step2: true,
      }));

      const wrapped = addEntityHooks(mockAdapters, {
        tenantId: "test-tenant",
        entityHooks: {
          roles: [{ beforeCreate: hook1 }, { beforeCreate: hook2 }],
        },
      });

      await wrapped.roles.create("test-tenant", { name: "Test" });

      // Hook1 called with original data
      expect(hook1).toHaveBeenCalledWith(expect.anything(), { name: "Test" });

      // Hook2 called with result from hook1
      expect(hook2).toHaveBeenCalledWith(expect.anything(), {
        name: "Test",
        step1: true,
      });

      // Adapter called with final result
      expect(mockAdapters.roles.create).toHaveBeenCalledWith("test-tenant", {
        name: "Test",
        step1: true,
        step2: true,
      });
    });

    it("should chain multiple afterCreate hooks in sequence", async () => {
      const mockAdapters = createMockAdapters();
      const callOrder: string[] = [];
      const hook1 = vi.fn().mockImplementation(async () => {
        callOrder.push("hook1");
      });
      const hook2 = vi.fn().mockImplementation(async () => {
        callOrder.push("hook2");
      });

      const wrapped = addEntityHooks(mockAdapters, {
        tenantId: "test-tenant",
        entityHooks: {
          roles: [{ afterCreate: hook1 }, { afterCreate: hook2 }],
        },
      });

      await wrapped.roles.create("test-tenant", { name: "Test" });

      expect(callOrder).toEqual(["hook1", "hook2"]);
    });

    it("should chain beforeUpdate hooks correctly", async () => {
      const mockAdapters = createMockAdapters();
      const hook1 = vi.fn().mockImplementation(async (ctx, id, data) => ({
        ...data,
        modified1: true,
      }));
      const hook2 = vi.fn().mockImplementation(async (ctx, id, data) => ({
        ...data,
        modified2: true,
      }));

      const wrapped = addEntityHooks(mockAdapters, {
        tenantId: "test-tenant",
        entityHooks: {
          roles: [{ beforeUpdate: hook1 }, { beforeUpdate: hook2 }],
        },
      });

      await wrapped.roles.update("test-tenant", "role-1", { name: "Updated" });

      expect(hook2).toHaveBeenCalledWith(expect.anything(), "role-1", {
        name: "Updated",
        modified1: true,
      });
      expect(mockAdapters.roles.update).toHaveBeenCalledWith(
        "test-tenant",
        "role-1",
        { name: "Updated", modified1: true, modified2: true },
      );
    });
  });

  describe("rolePermissions hooks", () => {
    it("should call beforeAssign and return modified permissions", async () => {
      const mockAdapters = createMockAdapters();
      const beforeAssign = vi
        .fn()
        .mockImplementation(async (ctx, roleId, permissions) => [
          ...permissions,
          { resource_server_identifier: "added", permission_name: "extra" },
        ]);

      const wrapped = addEntityHooks(mockAdapters, {
        tenantId: "test-tenant",
        entityHooks: {
          rolePermissions: [{ beforeAssign }],
        },
      });

      await wrapped.rolePermissions.assign("test-tenant", "role-1", [
        { resource_server_identifier: "api", permission_name: "read" },
      ]);

      expect(beforeAssign).toHaveBeenCalledTimes(1);
      expect(mockAdapters.rolePermissions.assign).toHaveBeenCalledWith(
        "test-tenant",
        "role-1",
        [
          { resource_server_identifier: "api", permission_name: "read" },
          { resource_server_identifier: "added", permission_name: "extra" },
        ],
      );
    });

    it("should call afterAssign after successful assignment", async () => {
      const mockAdapters = createMockAdapters();
      const afterAssign = vi.fn();

      const wrapped = addEntityHooks(mockAdapters, {
        tenantId: "test-tenant",
        entityHooks: {
          rolePermissions: [{ afterAssign }],
        },
      });

      await wrapped.rolePermissions.assign("test-tenant", "role-1", [
        { resource_server_identifier: "api", permission_name: "read" },
      ]);

      expect(afterAssign).toHaveBeenCalledTimes(1);
      expect(afterAssign).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "test-tenant" }),
        "role-1",
        [{ resource_server_identifier: "api", permission_name: "read" }],
      );
    });

    it("should call beforeRemove and afterRemove", async () => {
      const mockAdapters = createMockAdapters();
      const beforeRemove = vi
        .fn()
        .mockImplementation(async (ctx, roleId, permissions) => permissions);
      const afterRemove = vi.fn();

      const wrapped = addEntityHooks(mockAdapters, {
        tenantId: "test-tenant",
        entityHooks: {
          rolePermissions: [{ beforeRemove, afterRemove }],
        },
      });

      await wrapped.rolePermissions.remove("test-tenant", "role-1", [
        { resource_server_identifier: "api", permission_name: "read" },
      ]);

      expect(beforeRemove).toHaveBeenCalledTimes(1);
      expect(afterRemove).toHaveBeenCalledTimes(1);
    });
  });

  describe("tenants hooks", () => {
    it("should call beforeCreate and afterCreate for tenants", async () => {
      const mockAdapters = createMockAdapters();
      const beforeCreate = vi.fn().mockImplementation(async (ctx, data) => ({
        ...data,
        modified: true,
      }));
      const afterCreate = vi.fn();

      const wrapped = addEntityHooks(mockAdapters, {
        tenantId: "test-tenant",
        entityHooks: {
          tenants: [{ beforeCreate, afterCreate }],
        },
      });

      await wrapped.tenants.create({ id: "new-tenant", name: "New" });

      expect(beforeCreate).toHaveBeenCalledTimes(1);
      expect(mockAdapters.tenants.create).toHaveBeenCalledWith({
        id: "new-tenant",
        name: "New",
        modified: true,
      });
      expect(afterCreate).toHaveBeenCalledTimes(1);
    });

    it("should call beforeUpdate and afterUpdate for tenants", async () => {
      const mockAdapters = createMockAdapters();
      const beforeUpdate = vi
        .fn()
        .mockImplementation(async (ctx, id, data) => ({
          ...data,
          updatedByHook: true,
        }));
      const afterUpdate = vi.fn();

      const wrapped = addEntityHooks(mockAdapters, {
        tenantId: "test-tenant",
        entityHooks: {
          tenants: [{ beforeUpdate, afterUpdate }],
        },
      });

      await wrapped.tenants.update("tenant-1", { name: "Updated" });

      expect(beforeUpdate).toHaveBeenCalledTimes(1);
      expect(mockAdapters.tenants.update).toHaveBeenCalledWith("tenant-1", {
        name: "Updated",
        updatedByHook: true,
      });
      expect(afterUpdate).toHaveBeenCalledTimes(1);
    });

    it("should call beforeDelete and afterDelete for tenants", async () => {
      const mockAdapters = createMockAdapters();
      const beforeDelete = vi.fn();
      const afterDelete = vi.fn();

      const wrapped = addEntityHooks(mockAdapters, {
        tenantId: "test-tenant",
        entityHooks: {
          tenants: [{ beforeDelete, afterDelete }],
        },
      });

      await wrapped.tenants.remove("tenant-1");

      expect(beforeDelete).toHaveBeenCalledTimes(1);
      expect(afterDelete).toHaveBeenCalledTimes(1);
    });
  });

  describe("context object", () => {
    it("should provide tenantId in hook context", async () => {
      const mockAdapters = createMockAdapters();
      const beforeCreate = vi
        .fn()
        .mockImplementation(async (ctx, data) => data);

      const wrapped = addEntityHooks(mockAdapters, {
        tenantId: "my-tenant-id",
        entityHooks: {
          roles: [{ beforeCreate }],
        },
      });

      await wrapped.roles.create("my-tenant-id", { name: "Test" });

      expect(beforeCreate).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "my-tenant-id" }),
        expect.anything(),
      );
    });

    it("should provide adapters in hook context", async () => {
      const mockAdapters = createMockAdapters();
      const beforeCreate = vi
        .fn()
        .mockImplementation(async (ctx, data) => data);

      const wrapped = addEntityHooks(mockAdapters, {
        tenantId: "test-tenant",
        entityHooks: {
          roles: [{ beforeCreate }],
        },
      });

      await wrapped.roles.create("test-tenant", { name: "Test" });

      expect(beforeCreate).toHaveBeenCalledWith(
        expect.objectContaining({ adapters: mockAdapters }),
        expect.anything(),
      );
    });
  });

  describe("handles undefined hooks in array", () => {
    it("should filter out undefined hooks from array", async () => {
      const mockAdapters = createMockAdapters();
      const beforeCreate = vi.fn().mockImplementation(async (ctx, data) => ({
        ...data,
        modified: true,
      }));

      const wrapped = addEntityHooks(mockAdapters, {
        tenantId: "test-tenant",
        entityHooks: {
          roles: [undefined, { beforeCreate }, undefined],
        },
      });

      await wrapped.roles.create("test-tenant", { name: "Test" });

      expect(beforeCreate).toHaveBeenCalledTimes(1);
      expect(mockAdapters.roles.create).toHaveBeenCalledWith("test-tenant", {
        name: "Test",
        modified: true,
      });
    });
  });
});
