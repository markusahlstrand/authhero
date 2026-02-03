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
          strategy: "auth0",
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

    expect(patchClientsResponse.status).toBe(200);

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

    expect(patchClientsResponse2.status).toBe(200);

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
});
