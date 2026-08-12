import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import { Connection, Client } from "@authhero/adapter-interfaces";

describe("connections", () => {
  it("should support crud", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();

    // --------------------------------------------
    // POST
    // --------------------------------------------
    const createConnectionResponse = await managementClient.connections.$post(
      {
        json: {
          name: "apple",
          strategy: "apple",
          options: {
            team_id: "teamId",
          },
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

    expect(createConnectionResponse.status).toBe(201);
    const createdConnection = await createConnectionResponse.json();

    const { created_at, updated_at, id, ...rest } = createdConnection;

    expect(rest).toEqual({
      name: "apple",
      strategy: "apple",
      options: {
        team_id: "teamId",
      },
    });
    expect(created_at).toBeTypeOf("string");
    expect(updated_at).toBeTypeOf("string");
    expect(id).toBeTypeOf("string");

    // --------------------------------------------
    // PATCH
    // --------------------------------------------
    const updateConnectionResponse = await managementClient.connections[
      ":id"
    ].$patch(
      {
        param: {
          id: id!,
        },
        json: {
          options: {
            team_id: "teamId2",
          },
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

    expect(updateConnectionResponse.status).toBe(200);
    const updateConnection =
      (await updateConnectionResponse.json()) as Connection;
    expect(updateConnection.options).toEqual({
      team_id: "teamId2",
    });

    const updatesConnectionResponse = await managementClient.connections[
      ":id"
    ].$get(
      {
        param: {
          id: id!,
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
    expect(updatesConnectionResponse.status).toBe(200);
    const updatedConnection = await updatesConnectionResponse.json();
    expect(updatedConnection.options).toEqual({
      team_id: "teamId2",
    });

    // --------------------------------------------
    // DELETE
    // --------------------------------------------
    const deleteConnectionResponse = await managementClient.connections[
      ":id"
    ].$delete(
      {
        param: {
          id: id!,
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

    expect(deleteConnectionResponse.status).toBe(200);

    // --------------------------------------------
    // LIST
    // --------------------------------------------
    const listConnectionsResponse = await managementClient.connections.$get(
      {
        query: {},
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

    expect(listConnectionsResponse.status).toBe(200);
    const connections = await listConnectionsResponse.json();
    // There is a default email connection, Username-Password-Authentication connection, and mock-strategy connection created by the test server
    expect(connections.length).toEqual(3);
  });

  it("should get and update connection clients", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();

    // Create a connection
    const createConnectionResponse = await managementClient.connections.$post(
      {
        json: {
          name: "test-connection",
          strategy: "oidc",
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

    expect(createConnectionResponse.status).toBe(201);
    const connection = (await createConnectionResponse.json()) as Connection;

    // Create a client
    const createClientResponse = await managementClient.clients.$post(
      {
        json: {
          client_id: "test-client-1",
          name: "Test Client 1",
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

    expect(createClientResponse.status).toBe(201);
    const client1 = (await createClientResponse.json()) as Client;

    // Create another client
    const createClient2Response = await managementClient.clients.$post(
      {
        json: {
          client_id: "test-client-2",
          name: "Test Client 2",
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

    expect(createClient2Response.status).toBe(201);

    // GET /connections/:id/clients - should be empty initially
    const getClientsResponse = await managementClient.connections[":id"][
      "clients"
    ].$get(
      {
        param: {
          id: connection.id,
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

    expect(getClientsResponse.status).toBe(200);
    const clientsResult = (await getClientsResponse.json()) as {
      enabled_clients: Array<{ client_id: string; name: string }>;
    };
    expect(clientsResult.enabled_clients).toEqual([]);

    // PATCH /connections/:id/clients - enable connection for client
    const patchClientsResponse = await managementClient.connections[":id"][
      "clients"
    ].$patch(
      {
        param: {
          id: connection.id,
        },
        json: [
          { client_id: client1.client_id, status: true },
          { client_id: "test-client-2", status: true },
        ],
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

    // Auth0 returns 204 No Content for PATCH /connections/{id}/clients.
    expect(patchClientsResponse.status).toBe(204);

    // GET /connections/:id/clients - should now have two clients
    const getClientsResponse2 = await managementClient.connections[":id"][
      "clients"
    ].$get(
      {
        param: {
          id: connection.id,
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

    expect(getClientsResponse2.status).toBe(200);
    const clientsResult2 = (await getClientsResponse2.json()) as {
      enabled_clients: Array<{ client_id: string; name: string }>;
    };
    expect(clientsResult2.enabled_clients).toHaveLength(2);
    expect(
      clientsResult2.enabled_clients.map((c) => c.client_id).sort(),
    ).toEqual(["test-client-1", "test-client-2"]);

    // PATCH /connections/:id/clients - disable connection for one client
    const patchClientsResponse2 = await managementClient.connections[":id"][
      "clients"
    ].$patch(
      {
        param: {
          id: connection.id,
        },
        json: [{ client_id: client1.client_id, status: false }],
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

    expect(patchClientsResponse2.status).toBe(204);

    // GET /connections/:id/clients - should now have only one client
    const getClientsResponse3 = await managementClient.connections[":id"][
      "clients"
    ].$get(
      {
        param: {
          id: connection.id,
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

    expect(getClientsResponse3.status).toBe(200);
    const clientsResult3 = (await getClientsResponse3.json()) as {
      enabled_clients: Array<{ client_id: string; name: string }>;
    };
    expect(clientsResult3.enabled_clients).toHaveLength(1);
    expect(clientsResult3.enabled_clients[0].client_id).toBe("test-client-2");
  });

  it("should strip secret fields from connection responses", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();

    // POST — secrets in request, must not appear in response
    const createResponse = await managementClient.connections.$post(
      {
        json: {
          name: "google-oauth",
          strategy: "google-oauth2",
          options: {
            client_id: "google-client-id",
            client_secret: "super-secret",
            app_secret: "facebook-app-secret",
            twilio_sid: "AC123",
            twilio_token: "twilio-secret",
          },
        },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as Connection;
    expect(created.options?.client_secret).toBeUndefined();
    expect(created.options?.app_secret).toBeUndefined();
    expect(created.options?.twilio_token).toBeUndefined();
    // Non-secret fields must still be returned
    expect(created.options?.client_id).toBe("google-client-id");
    expect(created.options?.twilio_sid).toBe("AC123");

    // GET single
    const getResponse = await managementClient.connections[":id"].$get(
      {
        param: { id: created.id },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(getResponse.status).toBe(200);
    const fetched = (await getResponse.json()) as Connection;
    expect(fetched.options?.client_secret).toBeUndefined();
    expect(fetched.options?.app_secret).toBeUndefined();
    expect(fetched.options?.twilio_token).toBeUndefined();
    expect(fetched.options?.client_id).toBe("google-client-id");

    // PATCH — response must also be stripped
    const patchResponse = await managementClient.connections[":id"].$patch(
      {
        param: { id: created.id },
        json: { options: { client_secret: "rotated-secret" } },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(patchResponse.status).toBe(200);
    const patched = (await patchResponse.json()) as Connection;
    expect(patched.options?.client_secret).toBeUndefined();

    // GET list
    const listResponse = await managementClient.connections.$get(
      {
        query: {},
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(listResponse.status).toBe(200);
    const list = (await listResponse.json()) as Connection[];
    for (const conn of list) {
      expect(conn.options?.client_secret).toBeUndefined();
      expect(conn.options?.app_secret).toBeUndefined();
      expect(conn.options?.twilio_token).toBeUndefined();
    }
  });

  it("should return masked hints instead of secret values", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();

    const createResponse = await managementClient.connections.$post(
      {
        json: {
          name: "oidc-with-hints",
          strategy: "oidc",
          options: {
            client_id: "hint-client",
            // Long enough to reveal a prefix
            client_secret: "3a9f1234567890abcdef",
            // Too short to reveal anything
            twilio_token: "short",
            configuration: {
              client_secret: "cfg-secret-1234567890",
            },
          },
        },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as Connection;

    const getResponse = await managementClient.connections[":id"].$get(
      {
        param: { id: created.id },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    const fetched = (await getResponse.json()) as Connection;

    // Long secret: first four characters plus a fixed-width mask
    expect(fetched.options?.client_secret).toBeUndefined();
    expect(fetched.options?.client_secret_hint).toBe("3a9f••••••••");
    // Short secret: mask only, no prefix
    expect(fetched.options?.twilio_token).toBeUndefined();
    expect(fetched.options?.twilio_token_hint).toBe("••••••••");
    // Unset secret: no hint at all
    expect(fetched.options?.app_secret_hint).toBeUndefined();
    // Nested upstream migration secret is redacted the same way
    expect(fetched.options?.configuration?.client_secret).toBeUndefined();
    expect(fetched.options?.configuration?.client_secret_hint).toBe(
      "cfg-••••••••",
    );

    // The stored values are untouched
    const stored = await env.data.connections.get("tenantId", created.id);
    expect(stored?.options?.client_secret).toBe("3a9f1234567890abcdef");
    expect(stored?.options?.twilio_token).toBe("short");
    expect(stored?.options?.configuration?.client_secret).toBe(
      "cfg-secret-1234567890",
    );
    // Hints are never persisted
    expect(stored?.options?.client_secret_hint).toBeUndefined();
    expect(stored?.options?.twilio_token_hint).toBeUndefined();
    expect(stored?.options?.configuration?.client_secret_hint).toBeUndefined();
  });

  it("should ignore hints and blank secrets sent back by a client", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();

    const createResponse = await managementClient.connections.$post(
      {
        json: {
          name: "oidc-roundtrip",
          strategy: "oidc",
          options: {
            client_id: "roundtrip-client",
            client_secret: "3a9f1234567890abcdef",
            configuration: {
              client_id: "upstream-client",
              client_secret: "cfg-secret-1234567890",
            },
          },
        },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    const created = (await createResponse.json()) as Connection;

    // Simulate a UI that echoes the whole record back: the hint is present and
    // the secret input was left blank.
    const patchResponse = await managementClient.connections[":id"].$patch(
      {
        param: { id: created.id },
        json: {
          options: {
            client_id: "roundtrip-client-updated",
            client_secret: "",
            client_secret_hint: "3a9f••••••••",
            configuration: {
              client_id: "upstream-client",
              client_secret: "",
              client_secret_hint: "cfg-••••••••",
            },
          },
        },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(patchResponse.status).toBe(200);

    const stored = await env.data.connections.get("tenantId", created.id);
    expect(stored?.options?.client_id).toBe("roundtrip-client-updated");
    // Neither the mask nor the empty string replaced the stored secrets
    expect(stored?.options?.client_secret).toBe("3a9f1234567890abcdef");
    expect(stored?.options?.client_secret_hint).toBeUndefined();
    expect(stored?.options?.configuration?.client_secret).toBe(
      "cfg-secret-1234567890",
    );
    expect(stored?.options?.configuration?.client_secret_hint).toBeUndefined();
  });

  it("should keep secrets out of the audit log", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();

    const createResponse = await managementClient.connections.$post(
      {
        json: {
          name: "oidc-audit",
          strategy: "oidc",
          options: {
            client_id: "audit-client",
            client_secret: "3a9f1234567890abcdef",
          },
        },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    const created = (await createResponse.json()) as Connection;

    await managementClient.connections[":id"].$patch(
      {
        param: { id: created.id },
        json: { options: { client_secret: "rotated-1234567890abcdef" } },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: true,
    });
    const updateLog = logs.find(
      (log) => log.description === "Update a Connection",
    );
    expect(updateLog).toBeDefined();

    // The rotated secret is recorded as its hint, never in plaintext
    expect(JSON.stringify(updateLog)).toContain("rota••••••••");
    for (const log of logs) {
      const serialized = JSON.stringify(log);
      expect(serialized).not.toContain("3a9f1234567890abcdef");
      expect(serialized).not.toContain("rotated-1234567890abcdef");
    }
  });

  it("should preserve existing secrets when PATCH omits them", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();

    const createResponse = await managementClient.connections.$post(
      {
        json: {
          name: "jumpcloud",
          strategy: "oidc",
          options: {
            client_id: "jc-client",
            client_secret: "jc-secret",
            app_secret: "app-secret",
            twilio_token: "twilio-secret",
            token_endpoint_auth_method: "client_secret_post",
          },
        },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as Connection;

    // PATCH with options but no secret fields — secrets must survive.
    const patchResponse = await managementClient.connections[":id"].$patch(
      {
        param: { id: created.id },
        json: {
          options: {
            client_id: "jc-client",
            token_endpoint_auth_method: "client_secret_basic",
          },
        },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(patchResponse.status).toBe(200);

    const stored = await env.data.connections.get("tenantId", created.id);
    expect(stored?.options?.client_secret).toBe("jc-secret");
    expect(stored?.options?.app_secret).toBe("app-secret");
    expect(stored?.options?.twilio_token).toBe("twilio-secret");
    expect(stored?.options?.token_endpoint_auth_method).toBe(
      "client_secret_basic",
    );

    // PATCH that explicitly sets a new secret must overwrite the old one.
    const rotateResponse = await managementClient.connections[":id"].$patch(
      {
        param: { id: created.id },
        json: { options: { client_secret: "rotated" } },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(rotateResponse.status).toBe(200);

    const rotated = await env.data.connections.get("tenantId", created.id);
    expect(rotated?.options?.client_secret).toBe("rotated");
    expect(rotated?.options?.app_secret).toBe("app-secret");
    expect(rotated?.options?.twilio_token).toBe("twilio-secret");
  });
});
