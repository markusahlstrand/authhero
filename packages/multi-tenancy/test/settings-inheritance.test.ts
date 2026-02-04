import { describe, it, expect, beforeEach } from "vitest";
import {
  createRuntimeFallbackAdapter,
  withRuntimeFallback,
} from "../src/middleware/settings-inheritance";
import {
  DataAdapters,
  Connection,
  Client,
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
  // Mock clients adapter
  clients: {
    get: async (tenantId: string, clientId: string): Promise<Client | null> => {
      const clients: Record<string, Record<string, Client>> = {
        "control-plane": {
          "control-plane-client": {
            client_id: "control-plane-client",
            name: "Control Plane Client",
            callbacks: [
              "http://localhost:3000/callback",
              "https://dev.example.com/callback",
            ],
            web_origins: ["http://localhost:3000", "https://dev.example.com"],
            allowed_logout_urls: [
              "http://localhost:3000",
              "https://dev.example.com",
            ],
            allowed_origins: ["http://localhost:3000"],
            created_at: "2023-01-01T00:00:00Z",
            updated_at: "2023-01-01T00:00:00Z",
          },
          "other-cp-client": {
            client_id: "other-cp-client",
            name: "Other Control Plane Client",
            callbacks: ["https://other-app.example.com/callback"],
            web_origins: ["https://other-app.example.com"],
            allowed_logout_urls: ["https://other-app.example.com"],
            created_at: "2023-01-01T00:00:00Z",
            updated_at: "2023-01-01T00:00:00Z",
          },
        },
        "tenant-1": {
          "tenant-client": {
            client_id: "tenant-client",
            name: "Tenant Client",
            callbacks: ["https://tenant.example.com/callback"],
            web_origins: ["https://tenant.example.com"],
            allowed_logout_urls: ["https://tenant.example.com"],
            created_at: "2023-01-01T00:00:00Z",
            updated_at: "2023-01-01T00:00:00Z",
          },
        },
      };
      return clients[tenantId]?.[clientId] || null;
    },
    getByClientId: async (
      clientId: string,
    ): Promise<(Client & { tenant_id: string }) | null> => {
      const allClients: Record<string, Client & { tenant_id: string }> = {
        "control-plane-client": {
          client_id: "control-plane-client",
          name: "Control Plane Client",
          callbacks: [
            "http://localhost:3000/callback",
            "https://dev.example.com/callback",
          ],
          web_origins: ["http://localhost:3000", "https://dev.example.com"],
          allowed_logout_urls: [
            "http://localhost:3000",
            "https://dev.example.com",
          ],
          allowed_origins: ["http://localhost:3000"],
          tenant_id: "control-plane",
          created_at: "2023-01-01T00:00:00Z",
          updated_at: "2023-01-01T00:00:00Z",
        },
        "other-cp-client": {
          client_id: "other-cp-client",
          name: "Other Control Plane Client",
          callbacks: ["https://other-app.example.com/callback"],
          web_origins: ["https://other-app.example.com"],
          allowed_logout_urls: ["https://other-app.example.com"],
          tenant_id: "control-plane",
          created_at: "2023-01-01T00:00:00Z",
          updated_at: "2023-01-01T00:00:00Z",
        },
        "tenant-client": {
          client_id: "tenant-client",
          name: "Tenant Client",
          callbacks: ["https://tenant.example.com/callback"],
          web_origins: ["https://tenant.example.com"],
          allowed_logout_urls: ["https://tenant.example.com"],
          tenant_id: "tenant-1",
          created_at: "2023-01-01T00:00:00Z",
          updated_at: "2023-01-01T00:00:00Z",
        },
      };
      return allClients[clientId] || null;
    },
    list: async () => ({ clients: [], start: 0, limit: 10, length: 0 }),
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

  describe("clients", () => {
    it("should merge callbacks from control plane client", async () => {
      const client = await fallbackAdapter.clients.get(
        "tenant-1",
        "tenant-client",
      );

      expect(client).toBeDefined();
      expect(client!.callbacks).toEqual([
        "http://localhost:3000/callback", // from control plane
        "https://dev.example.com/callback", // from control plane
        "https://tenant.example.com/callback", // from tenant
      ]);
    });

    it("should merge web_origins from control plane client", async () => {
      const client = await fallbackAdapter.clients.get(
        "tenant-1",
        "tenant-client",
      );

      expect(client).toBeDefined();
      expect(client!.web_origins).toEqual([
        "http://localhost:3000", // from control plane
        "https://dev.example.com", // from control plane
        "https://tenant.example.com", // from tenant
      ]);
    });

    it("should merge allowed_logout_urls from control plane client", async () => {
      const client = await fallbackAdapter.clients.get(
        "tenant-1",
        "tenant-client",
      );

      expect(client).toBeDefined();
      expect(client!.allowed_logout_urls).toEqual([
        "http://localhost:3000", // from control plane
        "https://dev.example.com", // from control plane
        "https://tenant.example.com", // from tenant
      ]);
    });

    it("should merge allowed_origins from control plane client", async () => {
      const client = await fallbackAdapter.clients.get(
        "tenant-1",
        "tenant-client",
      );

      expect(client).toBeDefined();
      expect(client!.allowed_origins).toEqual([
        "http://localhost:3000", // from control plane (tenant has none)
      ]);
    });

    it("should deduplicate URLs when merging", async () => {
      // Create a mock where tenant has same URL as control plane
      const tenantWithDuplicateUrls = {
        ...mockAdapters,
        clients: {
          ...mockAdapters.clients,
          get: async (
            tenantId: string,
            clientId: string,
          ): Promise<Client | null> => {
            if (tenantId === "tenant-1" && clientId === "tenant-client") {
              return {
                client_id: "tenant-client",
                name: "Tenant Client",
                callbacks: [
                  "http://localhost:3000/callback", // same as control plane
                  "https://tenant.example.com/callback",
                ],
                web_origins: ["https://tenant.example.com"],
                allowed_logout_urls: ["https://tenant.example.com"],
                created_at: "2023-01-01T00:00:00Z",
                updated_at: "2023-01-01T00:00:00Z",
              };
            }
            return mockAdapters.clients.get(tenantId, clientId);
          },
        },
      };

      const adapterWithDuplicates = createRuntimeFallbackAdapter(
        tenantWithDuplicateUrls as DataAdapters,
        {
          controlPlaneTenantId: "control-plane",
          controlPlaneClientId: "control-plane-client",
        },
      );

      const client = await adapterWithDuplicates.clients.get(
        "tenant-1",
        "tenant-client",
      );

      expect(client).toBeDefined();
      // Should have deduplicated the localhost callback
      expect(client!.callbacks).toEqual([
        "http://localhost:3000/callback",
        "https://dev.example.com/callback",
        "https://tenant.example.com/callback",
      ]);
    });

    it("should not merge for control plane client itself", async () => {
      const client = await fallbackAdapter.clients.get(
        "control-plane",
        "control-plane-client",
      );

      expect(client).toBeDefined();
      expect(client!.callbacks).toEqual([
        "http://localhost:3000/callback",
        "https://dev.example.com/callback",
      ]);
    });

    it("should merge URLs for other clients in control plane tenant", async () => {
      const client = await fallbackAdapter.clients.get(
        "control-plane",
        "other-cp-client",
      );

      expect(client).toBeDefined();
      // Other clients in control plane tenant should get merged URLs
      expect(client!.callbacks).toEqual([
        "http://localhost:3000/callback", // from control plane client
        "https://dev.example.com/callback", // from control plane client
        "https://other-app.example.com/callback", // from other-cp-client
      ]);
      expect(client!.web_origins).toEqual([
        "http://localhost:3000", // from control plane client
        "https://dev.example.com", // from control plane client
        "https://other-app.example.com", // from other-cp-client
      ]);
    });

    it("should return original client when no control plane configured", async () => {
      const adapterWithoutControlPlane = createRuntimeFallbackAdapter(
        mockAdapters,
        {},
      );
      const client = await adapterWithoutControlPlane.clients.get(
        "tenant-1",
        "tenant-client",
      );

      expect(client).toBeDefined();
      expect(client!.callbacks).toEqual([
        "https://tenant.example.com/callback",
      ]);
    });

    it("should work with getByClientId", async () => {
      const client = await fallbackAdapter.clients.getByClientId(
        "tenant-client",
      );

      expect(client).toBeDefined();
      expect(client!.tenant_id).toBe("tenant-1");
      expect(client!.callbacks).toEqual([
        "http://localhost:3000/callback", // from control plane
        "https://dev.example.com/callback", // from control plane
        "https://tenant.example.com/callback", // from tenant
      ]);
    });

    it("should not merge getByClientId for control plane client itself", async () => {
      const client = await fallbackAdapter.clients.getByClientId(
        "control-plane-client",
      );

      expect(client).toBeDefined();
      expect(client!.tenant_id).toBe("control-plane");
      expect(client!.callbacks).toEqual([
        "http://localhost:3000/callback",
        "https://dev.example.com/callback",
      ]);
    });
  });
});
