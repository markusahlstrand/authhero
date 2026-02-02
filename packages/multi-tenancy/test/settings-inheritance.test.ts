import { describe, it, expect, beforeEach } from "vitest";
import {
  createRuntimeFallbackAdapter,
  withRuntimeFallback,
} from "../src/middleware/settings-inheritance";
import {
  DataAdapters,
  Connection,
} from "@authhero/adapter-interfaces";

// Mock data adapters for testing
const createMockAdapters = (): DataAdapters => ({
  connections: {
    get: async (
      tenantId: string,
      connectionId: string,
    ): Promise<Connection | null> => {
      const connections: Record<string, Record<string, Connection>> = {
        "control-plane": {
          "email-connection": {
            id: "email-connection",
            name: "email",
            strategy: "email",
            options: {
              from: "control@example.com",
              client_secret: "control-plane-api-key",
            },
            created_at: "2023-01-01T00:00:00Z",
            updated_at: "2023-01-01T00:00:00Z",
          },
        },
        "tenant-1": {
          "email-connection": {
            id: "email-connection",
            name: "email",
            strategy: "email",
            options: {
              from: "tenant@example.com",
              // client_secret is missing, should fallback to control plane
            },
            created_at: "2023-01-01T00:00:00Z",
            updated_at: "2023-01-01T00:00:00Z",
          },
        },
      };
      return connections[tenantId]?.[connectionId] || null;
    },
    list: async (tenantId: string) => {
      const lists: Record<string, Connection[]> = {
        "control-plane": [
          {
            id: "email-connection",
            name: "email",
            strategy: "email",
            options: {
              from: "control@example.com",
              client_secret: "control-plane-api-key",
            },
            created_at: "2023-01-01T00:00:00Z",
            updated_at: "2023-01-01T00:00:00Z",
          },
        ],
        "tenant-1": [
          {
            id: "email-connection",
            name: "email",
            strategy: "email",
            options: {
              from: "tenant@example.com",
              // client_secret is missing, should fallback to control plane
            },
            created_at: "2023-01-01T00:00:00Z",
            updated_at: "2023-01-01T00:00:00Z",
          },
        ],
      };
      return {
        connections: lists[tenantId] || [],
        start: 0,
        limit: 10,
        length: lists[tenantId]?.length || 0,
      };
    },
    create: async () => {
      throw new Error("Not implemented");
    },
    update: async () => {
      throw new Error("Not implemented");
    },
    remove: async () => {
      throw new Error("Not implemented");
    },
  },
  // Mock other adapters (empty implementations)
  clients: {} as any,
  clientGrants: {} as any,
  invites: {} as any,
  branding: {} as any,
  codes: {} as any,
  customDomains: {} as any,
  emailProviders: {} as any,
  forms: {} as any,
  hooks: {} as any,
  keys: {} as any,
  loginSessions: {} as any,
  logs: {} as any,
  passwords: {} as any,
  rolePermissions: {} as any,
  userPermissions: {} as any,
  promptSettings: {} as any,
  refreshTokens: {} as any,
  resourceServers: {} as any,
  roles: {} as any,
  sessions: {} as any,
  tenants: {} as any,
  themes: {} as any,
  users: {} as any,
  userRoles: {} as any,
  organizations: {} as any,
  userOrganizations: {} as any,
});

describe("Runtime Fallback Adapter (Settings Inheritance)", () => {
  let mockAdapters: DataAdapters;
  let fallbackAdapter: DataAdapters;

  beforeEach(() => {
    mockAdapters = createMockAdapters();
    fallbackAdapter = createRuntimeFallbackAdapter(mockAdapters, {
      controlPlaneTenantId: "control-plane",
      controlPlaneClientId: "control-plane-client",
    });
  });

  describe("connections", () => {
    it("should merge connection options with control plane fallbacks", async () => {
      const connection = await fallbackAdapter.connections.get(
        "tenant-1",
        "email-connection",
      );

      expect(connection).toBeDefined();
      expect(connection!.options).toEqual({
        from: "tenant@example.com", // tenant value takes precedence
        client_secret: "control-plane-api-key", // fallback from control plane
      });
    });

    it("should list connections with merged options", async () => {
      const result = await fallbackAdapter.connections.list("tenant-1");

      expect(result.connections).toHaveLength(1);
      expect(result.connections[0]?.options).toEqual({
        from: "tenant@example.com", // tenant value takes precedence
        client_secret: "control-plane-api-key", // fallback from control plane
      });
    });

    it("should return original connection when no control plane configured", async () => {
      const adapterWithoutControlPlane = createRuntimeFallbackAdapter(
        mockAdapters,
        {},
      );
      const connection = await adapterWithoutControlPlane.connections.get(
        "tenant-1",
        "email-connection",
      );

      expect(connection).toBeDefined();
      expect(connection!.options).toEqual({
        from: "tenant@example.com",
        // client_secret should be missing since no fallback
      });
    });

    it("should not merge for control plane tenant itself", async () => {
      const result = await fallbackAdapter.connections.list("control-plane");

      expect(result.connections).toHaveLength(1);
      expect(result.connections[0]?.options).toEqual({
        from: "control@example.com",
        client_secret: "control-plane-api-key",
      });
    });
  });

  describe("excludeSensitiveFields option", () => {
    let safeAdapter: DataAdapters;

    beforeEach(() => {
      safeAdapter = createRuntimeFallbackAdapter(mockAdapters, {
        controlPlaneTenantId: "control-plane",
        controlPlaneClientId: "control-plane-client",
        excludeSensitiveFields: true,
      });
    });

    it("should exclude client_secret from control plane fallback in connections.get", async () => {
      const connection = await safeAdapter.connections.get(
        "tenant-1",
        "email-connection",
      );

      expect(connection).toBeDefined();
      // Tenant's own 'from' value should be present
      expect(connection!.options?.from).toBe("tenant@example.com");
      // client_secret should NOT be inherited from control plane
      expect(connection!.options?.client_secret).toBeUndefined();
    });

    it("should exclude client_secret from control plane fallback in connections.list", async () => {
      const result = await safeAdapter.connections.list("tenant-1");

      expect(result.connections).toHaveLength(1);
      const connection = result.connections[0];
      // Tenant's own 'from' value should be present
      expect(connection?.options?.from).toBe("tenant@example.com");
      // client_secret should NOT be inherited from control plane
      expect(connection?.options?.client_secret).toBeUndefined();
    });

    it("should still include sensitive fields when tenant has them", async () => {
      // Create a mock adapter where tenant has its own client_secret
      const tenantWithSecretAdapters = {
        ...mockAdapters,
        connections: {
          ...mockAdapters.connections,
          get: async (
            tenantId: string,
            connectionId: string,
          ): Promise<Connection | null> => {
            if (tenantId === "tenant-1" && connectionId === "email-connection") {
              return {
                id: "email-connection",
                name: "email",
                strategy: "email",
                options: {
                  from: "tenant@example.com",
                  client_secret: "tenant-own-secret", // Tenant has its own secret
                },
                created_at: "2023-01-01T00:00:00Z",
                updated_at: "2023-01-01T00:00:00Z",
              };
            }
            return mockAdapters.connections.get(tenantId, connectionId);
          },
          list: async (tenantId: string) => {
            if (tenantId === "tenant-1") {
              return {
                connections: [
                  {
                    id: "email-connection",
                    name: "email",
                    strategy: "email",
                    options: {
                      from: "tenant@example.com",
                      client_secret: "tenant-own-secret",
                    },
                    created_at: "2023-01-01T00:00:00Z",
                    updated_at: "2023-01-01T00:00:00Z",
                  },
                ],
                start: 0,
                limit: 10,
                length: 1,
              };
            }
            return mockAdapters.connections.list(tenantId);
          },
        },
      };

      const adapterWithTenantSecret = createRuntimeFallbackAdapter(
        tenantWithSecretAdapters as DataAdapters,
        {
          controlPlaneTenantId: "control-plane",
          controlPlaneClientId: "control-plane-client",
          excludeSensitiveFields: true,
        },
      );

      const connection = await adapterWithTenantSecret.connections.get(
        "tenant-1",
        "email-connection",
      );

      expect(connection).toBeDefined();
      // Tenant's own client_secret should be preserved
      expect(connection!.options?.client_secret).toBe("tenant-own-secret");
    });

    it("should not affect control plane tenant itself", async () => {
      const connection = await safeAdapter.connections.get(
        "control-plane",
        "email-connection",
      );

      expect(connection).toBeDefined();
      // Control plane should see its own secret
      expect(connection!.options?.client_secret).toBe("control-plane-api-key");
    });

    it("should include sensitive fields when excludeSensitiveFields is false", async () => {
      // Verify the default behavior still works
      const connection = await fallbackAdapter.connections.get(
        "tenant-1",
        "email-connection",
      );

      expect(connection).toBeDefined();
      // client_secret SHOULD be inherited when excludeSensitiveFields is false
      expect(connection!.options?.client_secret).toBe("control-plane-api-key");
    });
  });

  describe("withRuntimeFallback helper", () => {
    it("should be equivalent to createRuntimeFallbackAdapter", async () => {
      const helperAdapter = withRuntimeFallback(mockAdapters, {
        controlPlaneTenantId: "control-plane",
        controlPlaneClientId: "control-plane-client",
      });

      // Test connections fallback works the same way
      const connection = await helperAdapter.connections.get(
        "tenant-1",
        "email-connection",
      );
      expect(connection).toBeDefined();
      expect(connection!.options?.client_secret).toBe("control-plane-api-key");
    });
  });
});
