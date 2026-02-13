import { describe, it, expect, beforeEach } from "vitest";
import {
  createRuntimeFallbackAdapter,
  withRuntimeFallback,
} from "../src/middleware/settings-inheritance";
import {
  DataAdapters,
  Connection,
  Client,
  ResourceServer,
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
  resourceServers: {
    get: async (
      tenantId: string,
      id: string,
    ): Promise<ResourceServer | null> => {
      const servers: Record<string, Record<string, ResourceServer>> = {
        "control-plane": {
          "api-rs": {
            id: "api-rs",
            name: "My API",
            identifier: "https://api.example.com",
            scopes: [
              { value: "read:users", description: "Read users" },
              { value: "write:users", description: "Write users" },
              { value: "admin", description: "Admin access" },
            ],
            token_lifetime: 86400,
            created_at: "2023-01-01T00:00:00Z",
            updated_at: "2023-01-01T00:00:00Z",
          },
        },
        "tenant-1": {
          "api-rs": {
            id: "api-rs",
            name: "My API",
            identifier: "https://api.example.com",
            // Tenant has no scopes - should inherit from control plane
            scopes: [],
            token_lifetime: 3600, // Different from control plane
            created_at: "2023-01-01T00:00:00Z",
            updated_at: "2023-01-01T00:00:00Z",
          },
          "tenant-specific-rs": {
            id: "tenant-specific-rs",
            name: "Tenant API",
            identifier: "https://tenant-api.example.com",
            scopes: [{ value: "tenant:read", description: "Read tenant data" }],
            token_lifetime: 7200,
            created_at: "2023-01-01T00:00:00Z",
            updated_at: "2023-01-01T00:00:00Z",
          },
        },
        "tenant-2": {
          "api-rs": {
            id: "api-rs",
            name: "My API",
            identifier: "https://api.example.com",
            // Tenant has some scopes that override control plane
            scopes: [
              { value: "read:users", description: "Tenant-specific read" },
              { value: "custom:scope", description: "Custom scope" },
            ],
            token_lifetime: 3600,
            created_at: "2023-01-01T00:00:00Z",
            updated_at: "2023-01-01T00:00:00Z",
          },
        },
      };
      return servers[tenantId]?.[id] || null;
    },
    list: async (tenantId: string, params?: { q?: string; per_page?: number }) => {
      const servers: Record<string, ResourceServer[]> = {
        "control-plane": [
          {
            id: "api-rs",
            name: "My API",
            identifier: "https://api.example.com",
            scopes: [
              { value: "read:users", description: "Read users" },
              { value: "write:users", description: "Write users" },
              { value: "admin", description: "Admin access" },
            ],
            token_lifetime: 86400,
            created_at: "2023-01-01T00:00:00Z",
            updated_at: "2023-01-01T00:00:00Z",
          },
        ],
        "tenant-1": [
          {
            id: "api-rs",
            name: "My API",
            identifier: "https://api.example.com",
            scopes: [],
            token_lifetime: 3600,
            created_at: "2023-01-01T00:00:00Z",
            updated_at: "2023-01-01T00:00:00Z",
          },
          {
            id: "tenant-specific-rs",
            name: "Tenant API",
            identifier: "https://tenant-api.example.com",
            scopes: [{ value: "tenant:read", description: "Read tenant data" }],
            token_lifetime: 7200,
            created_at: "2023-01-01T00:00:00Z",
            updated_at: "2023-01-01T00:00:00Z",
          },
        ],
        "tenant-2": [
          {
            id: "api-rs",
            name: "My API",
            identifier: "https://api.example.com",
            scopes: [
              { value: "read:users", description: "Tenant-specific read" },
              { value: "custom:scope", description: "Custom scope" },
            ],
            token_lifetime: 3600,
            created_at: "2023-01-01T00:00:00Z",
            updated_at: "2023-01-01T00:00:00Z",
          },
        ],
      };

      // Handle query filtering by identifier
      let result = servers[tenantId] || [];
      if (params?.q) {
        const match = params.q.match(/^identifier:(.+)$/);
        if (match) {
          result = result.filter((rs) => rs.identifier === match[1]);
        }
      }

      return {
        resource_servers: result,
        start: 0,
        limit: params?.per_page || 10,
        length: result.length,
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

    it("should store multiTenancyConfig on the adapter", async () => {
      expect(fallbackAdapter.multiTenancyConfig).toBeDefined();
      expect(fallbackAdapter.multiTenancyConfig?.controlPlaneTenantId).toBe(
        "control-plane",
      );
      expect(fallbackAdapter.multiTenancyConfig?.controlPlaneClientId).toBe(
        "control-plane-client",
      );
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

  describe("management adapter pattern (raw adapter with multiTenancyConfig)", () => {
    // This tests the pattern used by the management API where we want:
    // 1. Raw data without control plane merging
    // 2. multiTenancyConfig available for tenant access control
    let managementAdapter: DataAdapters;

    beforeEach(() => {
      // Simulate what init.ts does for managementDataAdapter
      managementAdapter = {
        ...mockAdapters,
        multiTenancyConfig: {
          controlPlaneTenantId: "control-plane",
          controlPlaneClientId: "control-plane-client",
        },
      };
    });

    it("should have multiTenancyConfig available for access control", () => {
      expect(managementAdapter.multiTenancyConfig).toBeDefined();
      expect(managementAdapter.multiTenancyConfig?.controlPlaneTenantId).toBe(
        "control-plane",
      );
      expect(managementAdapter.multiTenancyConfig?.controlPlaneClientId).toBe(
        "control-plane-client",
      );
    });

    it("should return raw connection data without control plane merging", async () => {
      const connection = await managementAdapter.connections.get(
        "tenant-1",
        "email-connection",
      );

      expect(connection).toBeDefined();
      // Should have tenant's own 'from' value
      expect(connection!.options?.from).toBe("tenant@example.com");
      // Should NOT have client_secret from control plane
      expect(connection!.options?.client_secret).toBeUndefined();
    });

    it("should list raw connections without control plane merging", async () => {
      const result = await managementAdapter.connections.list("tenant-1");

      expect(result.connections).toHaveLength(1);
      const connection = result.connections[0];
      expect(connection?.options?.from).toBe("tenant@example.com");
      // Should NOT have client_secret from control plane
      expect(connection?.options?.client_secret).toBeUndefined();
    });

    it("should return raw client data without URL merging", async () => {
      const client = await managementAdapter.clients.get(
        "tenant-1",
        "tenant-client",
      );

      expect(client).toBeDefined();
      // Should only have tenant's own callbacks
      expect(client!.callbacks).toEqual([
        "https://tenant.example.com/callback",
      ]);
      // Should only have tenant's own web_origins
      expect(client!.web_origins).toEqual(["https://tenant.example.com"]);
    });

    it("should return raw client data via getByClientId without URL merging", async () => {
      const client = await managementAdapter.clients.getByClientId(
        "tenant-client",
      );

      expect(client).toBeDefined();
      expect(client!.tenant_id).toBe("tenant-1");
      // Should only have tenant's own callbacks
      expect(client!.callbacks).toEqual([
        "https://tenant.example.com/callback",
      ]);
    });

    it("should contrast with auth adapter which does merge data", async () => {
      // Auth adapter uses withRuntimeFallback
      const authAdapter = withRuntimeFallback(mockAdapters, {
        controlPlaneTenantId: "control-plane",
        controlPlaneClientId: "control-plane-client",
      });

      // Management adapter: raw data
      const mgmtConnection = await managementAdapter.connections.get(
        "tenant-1",
        "email-connection",
      );
      expect(mgmtConnection!.options?.client_secret).toBeUndefined();

      // Auth adapter: merged data
      const authConnection = await authAdapter.connections.get(
        "tenant-1",
        "email-connection",
      );
      expect(authConnection!.options?.client_secret).toBe(
        "control-plane-api-key",
      );

      // Management adapter: raw client URLs
      const mgmtClient = await managementAdapter.clients.get(
        "tenant-1",
        "tenant-client",
      );
      expect(mgmtClient!.callbacks).toHaveLength(1);

      // Auth adapter: merged client URLs
      const authClient = await authAdapter.clients.get(
        "tenant-1",
        "tenant-client",
      );
      expect(authClient!.callbacks).toHaveLength(3);
    });
  });

  describe("resourceServers scope inheritance", () => {
    it("should inherit scopes from control plane when tenant has no scopes", async () => {
      const rs = await fallbackAdapter.resourceServers.get("tenant-1", "api-rs");

      expect(rs).toBeDefined();
      expect(rs!.token_lifetime).toBe(3600); // Tenant value preserved
      expect(rs!.scopes).toHaveLength(3); // Inherited from control plane
      expect(rs!.scopes).toEqual([
        { value: "read:users", description: "Read users" },
        { value: "write:users", description: "Write users" },
        { value: "admin", description: "Admin access" },
      ]);
    });

    it("should merge scopes with tenant scopes taking precedence", async () => {
      const tenant2Adapter = createRuntimeFallbackAdapter(mockAdapters, {
        controlPlaneTenantId: "control-plane",
        controlPlaneClientId: "control-plane-client",
      });

      const rs = await tenant2Adapter.resourceServers.get("tenant-2", "api-rs");

      expect(rs).toBeDefined();
      expect(rs!.scopes).toHaveLength(4); // 3 from control plane + 1 custom (read:users is overridden)
      
      // Find scope values
      const scopeValues = rs!.scopes!.map((s) => s.value);
      expect(scopeValues).toContain("read:users");
      expect(scopeValues).toContain("write:users");
      expect(scopeValues).toContain("admin");
      expect(scopeValues).toContain("custom:scope");

      // Check that tenant's read:users description takes precedence
      const readUsersScope = rs!.scopes!.find((s) => s.value === "read:users");
      expect(readUsersScope?.description).toBe("Tenant-specific read");
    });

    it("should not merge scopes for control plane tenant itself", async () => {
      const rs = await fallbackAdapter.resourceServers.get("control-plane", "api-rs");

      expect(rs).toBeDefined();
      expect(rs!.scopes).toHaveLength(3);
      expect(rs!.scopes).toEqual([
        { value: "read:users", description: "Read users" },
        { value: "write:users", description: "Write users" },
        { value: "admin", description: "Admin access" },
      ]);
    });

    it("should not merge scopes for tenant-specific resource server without control plane match", async () => {
      const rs = await fallbackAdapter.resourceServers.get(
        "tenant-1",
        "tenant-specific-rs",
      );

      expect(rs).toBeDefined();
      expect(rs!.scopes).toHaveLength(1);
      expect(rs!.scopes).toEqual([
        { value: "tenant:read", description: "Read tenant data" },
      ]);
    });

    it("should list resource servers with merged scopes", async () => {
      const result = await fallbackAdapter.resourceServers.list("tenant-1");

      expect(result.resource_servers).toHaveLength(2);

      // Find the api-rs
      const apiRs = result.resource_servers.find(
        (rs) => rs.identifier === "https://api.example.com",
      );
      expect(apiRs).toBeDefined();
      expect(apiRs!.scopes).toHaveLength(3); // Inherited from control plane

      // Find the tenant-specific RS (no merging)
      const tenantRs = result.resource_servers.find(
        (rs) => rs.identifier === "https://tenant-api.example.com",
      );
      expect(tenantRs).toBeDefined();
      expect(tenantRs!.scopes).toHaveLength(1);
    });

    it("should return original scopes when no control plane configured", async () => {
      const adapterWithoutControlPlane = createRuntimeFallbackAdapter(
        mockAdapters,
        {},
      );
      const rs = await adapterWithoutControlPlane.resourceServers.get(
        "tenant-1",
        "api-rs",
      );

      expect(rs).toBeDefined();
      expect(rs!.scopes).toEqual([]); // No inheritance, tenant has empty scopes
    });

    it("should return null for non-existent resource server", async () => {
      const rs = await fallbackAdapter.resourceServers.get(
        "tenant-1",
        "non-existent",
      );

      expect(rs).toBeNull();
    });
  });
});
