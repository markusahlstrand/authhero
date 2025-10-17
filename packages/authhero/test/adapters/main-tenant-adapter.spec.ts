import { describe, expect, it, beforeEach } from "vitest";
import { createMainTenantAdapter } from "../../src/adapters/main-tenant-adapter";
import {
  DataAdapters,
  LegacyClient,
  Connection,
} from "@authhero/adapter-interfaces";

// Mock data adapters for testing
const createMockAdapters = (): DataAdapters => ({
  legacyClients: {
    get: async (id: string): Promise<LegacyClient | null> => {
      const clients: Record<string, LegacyClient> = {
        "main-client": {
          client_id: "main-client",
          name: "Main Client",
          client_secret: "secret",
          web_origins: ["https://main.example.com"],
          allowed_logout_urls: ["https://main.example.com/logout"],
          callbacks: ["https://main.example.com/callback"],
          connections: [],
          tenant: {
            id: "main-tenant",
            friendly_name: "Main Tenant",
            audience: "https://main.example.com",
            sender_email: "main@example.com",
            sender_name: "Main Sender",
            created_at: "2023-01-01T00:00:00Z",
            updated_at: "2023-01-01T00:00:00Z",
          },
          disable_sign_ups: false,
          email_validation: "disabled",
          created_at: "2023-01-01T00:00:00Z",
          updated_at: "2023-01-01T00:00:00Z",
          global: false,
          is_first_party: false,
          oidc_conformant: true,
          sso: false,
          sso_disabled: true,
          cross_origin_authentication: false,
          custom_login_page_on: false,
          require_pushed_authorization_requests: false,
          require_proof_of_possession: false,
        },
        "tenant-client": {
          client_id: "tenant-client",
          name: "Tenant Client",
          client_secret: "tenant-secret",
          web_origins: ["https://tenant.example.com"],
          allowed_logout_urls: ["https://tenant.example.com/logout"],
          callbacks: ["https://tenant.example.com/callback"],
          connections: [],
          tenant: {
            id: "tenant-1",
            friendly_name: "Tenant 1",
            audience: "https://tenant.example.com",
            sender_email: "tenant@example.com",
            sender_name: "Tenant Sender",
            created_at: "2023-01-01T00:00:00Z",
            updated_at: "2023-01-01T00:00:00Z",
          },
          disable_sign_ups: false,
          email_validation: "disabled",
          created_at: "2023-01-01T00:00:00Z",
          updated_at: "2023-01-01T00:00:00Z",
          global: false,
          is_first_party: false,
          oidc_conformant: true,
          sso: false,
          sso_disabled: true,
          cross_origin_authentication: false,
          custom_login_page_on: false,
          require_pushed_authorization_requests: false,
          require_proof_of_possession: false,
        },
      };
      return clients[id] || null;
    },
  },
  connections: {
    get: async (
      tenantId: string,
      connectionId: string,
    ): Promise<Connection | null> => {
      const connections: Record<string, Record<string, Connection>> = {
        "main-tenant": {
          "email-connection": {
            id: "email-connection",
            name: "email",
            strategy: "email",
            options: {
              from: "main@example.com",
              client_secret: "main-api-key",
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
              // client_secret is missing, should fallback to main
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
        "main-tenant": [
          {
            id: "email-connection",
            name: "email",
            strategy: "email",
            options: {
              from: "main@example.com",
              client_secret: "main-api-key",
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
              // client_secret is missing, should fallback to main
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
  clients: {} as any,
  // Mock other adapters
  applications: {} as any,
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

describe("Main Tenant Adapter", () => {
  let mockAdapters: DataAdapters;
  let mainTenantAdapter: DataAdapters;

  beforeEach(() => {
    mockAdapters = createMockAdapters();
    mainTenantAdapter = createMainTenantAdapter(mockAdapters, {
      mainTenantId: "main-tenant",
      mainClientId: "main-client",
    });
  });

  describe("clients", () => {
    it("should merge client properties with main client fallbacks", async () => {
      const client = await mainTenantAdapter.legacyClients.get("tenant-client");

      expect(client).toBeDefined();
      expect(client!.web_origins).toEqual([
        "https://main.example.com", // from main client
        "https://tenant.example.com", // from tenant client
      ]);
      expect(client!.allowed_logout_urls).toEqual([
        "https://main.example.com/logout", // from main client
        "https://tenant.example.com/logout", // from tenant client
      ]);
      expect(client!.callbacks).toEqual([
        "https://main.example.com/callback", // from main client
        "https://tenant.example.com/callback", // from tenant client
      ]);
    });

    it("should return null for non-existent client", async () => {
      const client = await mainTenantAdapter.legacyClients.get("non-existent");
      expect(client).toBeNull();
    });
  });

  describe("connections", () => {
    it("should merge connection options with main tenant fallbacks", async () => {
      const connection = await mainTenantAdapter.connections.get(
        "tenant-1",
        "email-connection",
      );

      expect(connection).toBeDefined();
      expect(connection!.options).toEqual({
        from: "tenant@example.com", // tenant value takes precedence
        client_secret: "main-api-key", // fallback from main tenant
      });
    });

    it("should list connections with merged options", async () => {
      const result = await mainTenantAdapter.connections.list("tenant-1");

      expect(result.connections).toHaveLength(1);
      expect(result.connections[0]?.options).toEqual({
        from: "tenant@example.com", // tenant value takes precedence
        client_secret: "main-api-key", // fallback from main tenant
      });
    });

    it("should return original connection when no main tenant configured", async () => {
      const adapterWithoutMain = createMainTenantAdapter(mockAdapters, {});
      const connection = await adapterWithoutMain.connections.get(
        "tenant-1",
        "email-connection",
      );

      expect(connection).toBeDefined();
      expect(connection!.options).toEqual({
        from: "tenant@example.com",
        // client_secret should be missing since no fallback
      });
    });
  });
});
