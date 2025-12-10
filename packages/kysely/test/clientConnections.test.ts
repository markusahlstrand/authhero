import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "./helpers/test-server";

describe("ClientConnectionsAdapter", () => {
  let adapter: any;
  let db: any;
  const tenantId = "test-tenant";

  beforeEach(async () => {
    const testServer = await getTestServer();
    adapter = testServer.data;
    db = testServer.db;

    // Create a test tenant
    await db
      .insertInto("tenants")
      .values({
        id: tenantId,
        friendly_name: "Test Tenant",
        audience: "https://test.authhero.com/api/v2/",
        sender_email: "test@authhero.com",
        sender_name: "Test Sender",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();

    // Create test clients
    await db
      .insertInto("clients")
      .values({
        tenant_id: tenantId,
        client_id: "client-1",
        name: "Test Client 1",
        client_secret: "test-secret-1",
        callbacks: "[]",
        allowed_origins: "[]",
        web_origins: "[]",
        client_aliases: "[]",
        allowed_clients: "[]",
        connections: "[]",
        allowed_logout_urls: "[]",
        session_transfer: "{}",
        oidc_logout: "{}",
        grant_types: "[]",
        jwt_configuration: "{}",
        signing_keys: "[]",
        encryption_key: "{}",
        addons: "{}",
        client_metadata: "{}",
        mobile: "{}",
        native_social_login: "{}",
        refresh_token: "{}",
        default_organization: "{}",
        client_authentication_methods: "{}",
        signed_request_object: "{}",
        token_quota: "{}",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();

    await db
      .insertInto("clients")
      .values({
        tenant_id: tenantId,
        client_id: "client-2",
        name: "Test Client 2",
        client_secret: "test-secret-2",
        callbacks: "[]",
        allowed_origins: "[]",
        web_origins: "[]",
        client_aliases: "[]",
        allowed_clients: "[]",
        connections: "[]",
        allowed_logout_urls: "[]",
        session_transfer: "{}",
        oidc_logout: "{}",
        grant_types: "[]",
        jwt_configuration: "{}",
        signing_keys: "[]",
        encryption_key: "{}",
        addons: "{}",
        client_metadata: "{}",
        mobile: "{}",
        native_social_login: "{}",
        refresh_token: "{}",
        default_organization: "{}",
        client_authentication_methods: "{}",
        signed_request_object: "{}",
        token_quota: "{}",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();

    // Create test connections
    await db
      .insertInto("connections")
      .values({
        id: "conn-1",
        tenant_id: tenantId,
        name: "Username-Password",
        strategy: "auth0",
        options: "{}",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();

    await db
      .insertInto("connections")
      .values({
        id: "conn-2",
        tenant_id: tenantId,
        name: "Google",
        strategy: "google-oauth2",
        options: '{"client_id":"google-client-id"}',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();

    await db
      .insertInto("connections")
      .values({
        id: "conn-3",
        tenant_id: tenantId,
        name: "GitHub",
        strategy: "github",
        options: '{"client_id":"github-client-id"}',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();
  });

  describe("listByClient", () => {
    it("should return empty array when client has no connections", async () => {
      const connections = await adapter.clientConnections.listByClient(
        tenantId,
        "client-1",
      );

      expect(connections).toEqual([]);
    });

    it("should return connections in order specified by client", async () => {
      // Set up client with connections in specific order
      await db
        .updateTable("clients")
        .set({ connections: JSON.stringify(["conn-2", "conn-1", "conn-3"]) })
        .where("client_id", "=", "client-1")
        .execute();

      const connections = await adapter.clientConnections.listByClient(
        tenantId,
        "client-1",
      );

      expect(connections).toHaveLength(3);
      expect(connections[0].id).toBe("conn-2");
      expect(connections[0].name).toBe("Google");
      expect(connections[1].id).toBe("conn-1");
      expect(connections[1].name).toBe("Username-Password");
      expect(connections[2].id).toBe("conn-3");
      expect(connections[2].name).toBe("GitHub");
    });

    it("should return empty array for non-existent client", async () => {
      const connections = await adapter.clientConnections.listByClient(
        tenantId,
        "non-existent-client",
      );

      expect(connections).toEqual([]);
    });

    it("should filter out non-existent connections", async () => {
      // Set up client with connections including one that doesn't exist
      await db
        .updateTable("clients")
        .set({
          connections: JSON.stringify([
            "conn-1",
            "non-existent-conn",
            "conn-2",
          ]),
        })
        .where("client_id", "=", "client-1")
        .execute();

      const connections = await adapter.clientConnections.listByClient(
        tenantId,
        "client-1",
      );

      expect(connections).toHaveLength(2);
      expect(connections[0].id).toBe("conn-1");
      expect(connections[1].id).toBe("conn-2");
    });

    it("should parse connection options correctly", async () => {
      await db
        .updateTable("clients")
        .set({ connections: JSON.stringify(["conn-2"]) })
        .where("client_id", "=", "client-1")
        .execute();

      const connections = await adapter.clientConnections.listByClient(
        tenantId,
        "client-1",
      );

      expect(connections).toHaveLength(1);
      expect(connections[0].options).toEqual({ client_id: "google-client-id" });
    });
  });

  describe("updateByClient", () => {
    it("should update client connections", async () => {
      const result = await adapter.clientConnections.updateByClient(
        tenantId,
        "client-1",
        ["conn-1", "conn-2"],
      );

      expect(result).toBe(true);

      // Verify the connections were saved
      const client = await db
        .selectFrom("clients")
        .where("client_id", "=", "client-1")
        .select("connections")
        .executeTakeFirst();

      expect(JSON.parse(client.connections)).toEqual(["conn-1", "conn-2"]);
    });

    it("should replace existing connections", async () => {
      // Set initial connections
      await db
        .updateTable("clients")
        .set({ connections: JSON.stringify(["conn-1", "conn-2"]) })
        .where("client_id", "=", "client-1")
        .execute();

      // Update to different connections
      await adapter.clientConnections.updateByClient(tenantId, "client-1", [
        "conn-3",
      ]);

      const client = await db
        .selectFrom("clients")
        .where("client_id", "=", "client-1")
        .select("connections")
        .executeTakeFirst();

      expect(JSON.parse(client.connections)).toEqual(["conn-3"]);
    });

    it("should allow reordering connections", async () => {
      await db
        .updateTable("clients")
        .set({ connections: JSON.stringify(["conn-1", "conn-2", "conn-3"]) })
        .where("client_id", "=", "client-1")
        .execute();

      // Reorder
      await adapter.clientConnections.updateByClient(tenantId, "client-1", [
        "conn-3",
        "conn-1",
        "conn-2",
      ]);

      const client = await db
        .selectFrom("clients")
        .where("client_id", "=", "client-1")
        .select("connections")
        .executeTakeFirst();

      expect(JSON.parse(client.connections)).toEqual([
        "conn-3",
        "conn-1",
        "conn-2",
      ]);
    });

    it("should allow clearing all connections", async () => {
      await db
        .updateTable("clients")
        .set({ connections: JSON.stringify(["conn-1", "conn-2"]) })
        .where("client_id", "=", "client-1")
        .execute();

      await adapter.clientConnections.updateByClient(tenantId, "client-1", []);

      const client = await db
        .selectFrom("clients")
        .where("client_id", "=", "client-1")
        .select("connections")
        .executeTakeFirst();

      expect(JSON.parse(client.connections)).toEqual([]);
    });

    it("should return false for non-existent client", async () => {
      const result = await adapter.clientConnections.updateByClient(
        tenantId,
        "non-existent-client",
        ["conn-1"],
      );

      expect(result).toBe(false);
    });

    it("should update the updated_at timestamp", async () => {
      const clientBefore = await db
        .selectFrom("clients")
        .where("client_id", "=", "client-1")
        .select("updated_at")
        .executeTakeFirst();

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await adapter.clientConnections.updateByClient(tenantId, "client-1", [
        "conn-1",
      ]);

      const clientAfter = await db
        .selectFrom("clients")
        .where("client_id", "=", "client-1")
        .select("updated_at")
        .executeTakeFirst();

      expect(new Date(clientAfter.updated_at).getTime()).toBeGreaterThan(
        new Date(clientBefore.updated_at).getTime(),
      );
    });
  });

  describe("addClientToConnection", () => {
    it("should add connection to client", async () => {
      const result = await adapter.clientConnections.addClientToConnection(
        tenantId,
        "conn-1",
        "client-1",
      );

      expect(result).toBe(true);

      const client = await db
        .selectFrom("clients")
        .where("client_id", "=", "client-1")
        .select("connections")
        .executeTakeFirst();

      expect(JSON.parse(client.connections)).toContain("conn-1");
    });

    it("should not duplicate connection if already present", async () => {
      await db
        .updateTable("clients")
        .set({ connections: JSON.stringify(["conn-1"]) })
        .where("client_id", "=", "client-1")
        .execute();

      const result = await adapter.clientConnections.addClientToConnection(
        tenantId,
        "conn-1",
        "client-1",
      );

      expect(result).toBe(true);

      const client = await db
        .selectFrom("clients")
        .where("client_id", "=", "client-1")
        .select("connections")
        .executeTakeFirst();

      const connections = JSON.parse(client.connections);
      expect(connections).toEqual(["conn-1"]);
      expect(connections.filter((c: string) => c === "conn-1")).toHaveLength(1);
    });

    it("should append to existing connections", async () => {
      await db
        .updateTable("clients")
        .set({ connections: JSON.stringify(["conn-1"]) })
        .where("client_id", "=", "client-1")
        .execute();

      await adapter.clientConnections.addClientToConnection(
        tenantId,
        "conn-2",
        "client-1",
      );

      const client = await db
        .selectFrom("clients")
        .where("client_id", "=", "client-1")
        .select("connections")
        .executeTakeFirst();

      expect(JSON.parse(client.connections)).toEqual(["conn-1", "conn-2"]);
    });

    it("should return false for non-existent client", async () => {
      const result = await adapter.clientConnections.addClientToConnection(
        tenantId,
        "conn-1",
        "non-existent-client",
      );

      expect(result).toBe(false);
    });
  });

  describe("removeClientFromConnection", () => {
    it("should remove connection from client", async () => {
      await db
        .updateTable("clients")
        .set({ connections: JSON.stringify(["conn-1", "conn-2"]) })
        .where("client_id", "=", "client-1")
        .execute();

      const result = await adapter.clientConnections.removeClientFromConnection(
        tenantId,
        "conn-1",
        "client-1",
      );

      expect(result).toBe(true);

      const client = await db
        .selectFrom("clients")
        .where("client_id", "=", "client-1")
        .select("connections")
        .executeTakeFirst();

      expect(JSON.parse(client.connections)).toEqual(["conn-2"]);
    });

    it("should return true when connection not present (no change needed)", async () => {
      await db
        .updateTable("clients")
        .set({ connections: JSON.stringify(["conn-1"]) })
        .where("client_id", "=", "client-1")
        .execute();

      const result = await adapter.clientConnections.removeClientFromConnection(
        tenantId,
        "conn-2",
        "client-1",
      );

      expect(result).toBe(true);

      const client = await db
        .selectFrom("clients")
        .where("client_id", "=", "client-1")
        .select("connections")
        .executeTakeFirst();

      // Should be unchanged
      expect(JSON.parse(client.connections)).toEqual(["conn-1"]);
    });

    it("should return false for non-existent client", async () => {
      const result = await adapter.clientConnections.removeClientFromConnection(
        tenantId,
        "conn-1",
        "non-existent-client",
      );

      expect(result).toBe(false);
    });

    it("should preserve order of remaining connections", async () => {
      await db
        .updateTable("clients")
        .set({ connections: JSON.stringify(["conn-1", "conn-2", "conn-3"]) })
        .where("client_id", "=", "client-1")
        .execute();

      await adapter.clientConnections.removeClientFromConnection(
        tenantId,
        "conn-2",
        "client-1",
      );

      const client = await db
        .selectFrom("clients")
        .where("client_id", "=", "client-1")
        .select("connections")
        .executeTakeFirst();

      expect(JSON.parse(client.connections)).toEqual(["conn-1", "conn-3"]);
    });
  });

  describe("integration scenarios", () => {
    it("should support full add-reorder-remove workflow", async () => {
      // Start with no connections
      let connections = await adapter.clientConnections.listByClient(
        tenantId,
        "client-1",
      );
      expect(connections).toHaveLength(0);

      // Add connections one by one
      await adapter.clientConnections.addClientToConnection(
        tenantId,
        "conn-1",
        "client-1",
      );
      await adapter.clientConnections.addClientToConnection(
        tenantId,
        "conn-2",
        "client-1",
      );
      await adapter.clientConnections.addClientToConnection(
        tenantId,
        "conn-3",
        "client-1",
      );

      connections = await adapter.clientConnections.listByClient(
        tenantId,
        "client-1",
      );
      expect(connections).toHaveLength(3);
      expect(connections.map((c: any) => c.id)).toEqual([
        "conn-1",
        "conn-2",
        "conn-3",
      ]);

      // Reorder connections
      await adapter.clientConnections.updateByClient(tenantId, "client-1", [
        "conn-3",
        "conn-1",
        "conn-2",
      ]);

      connections = await adapter.clientConnections.listByClient(
        tenantId,
        "client-1",
      );
      expect(connections.map((c: any) => c.id)).toEqual([
        "conn-3",
        "conn-1",
        "conn-2",
      ]);

      // Remove a connection
      await adapter.clientConnections.removeClientFromConnection(
        tenantId,
        "conn-1",
        "client-1",
      );

      connections = await adapter.clientConnections.listByClient(
        tenantId,
        "client-1",
      );
      expect(connections.map((c: any) => c.id)).toEqual(["conn-3", "conn-2"]);
    });

    it("should isolate connections between clients", async () => {
      // Set different connections for different clients
      await adapter.clientConnections.updateByClient(tenantId, "client-1", [
        "conn-1",
        "conn-2",
      ]);
      await adapter.clientConnections.updateByClient(tenantId, "client-2", [
        "conn-2",
        "conn-3",
      ]);

      const client1Connections =
        await adapter.clientConnections.listByClient(tenantId, "client-1");
      const client2Connections =
        await adapter.clientConnections.listByClient(tenantId, "client-2");

      expect(client1Connections.map((c: any) => c.id)).toEqual([
        "conn-1",
        "conn-2",
      ]);
      expect(client2Connections.map((c: any) => c.id)).toEqual([
        "conn-2",
        "conn-3",
      ]);
    });
  });
});
