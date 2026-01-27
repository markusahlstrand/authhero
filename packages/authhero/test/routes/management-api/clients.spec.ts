import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import { Connection, Client } from "@authhero/adapter-interfaces";

describe("clients", () => {
  it("should support crud", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();
    const createClientResponse = await managementClient.clients.$post(
      {
        json: {
          client_id: "app",
          name: "app",
          callbacks: [],
          allowed_logout_urls: [],
          allowed_origins: [],
          web_origins: [],
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
    const createdClient = await createClientResponse.json();

    const { created_at, updated_at, client_id, client_secret, ...rest } =
      createdClient;

    expect(rest).toEqual({
      auth0_conformant: true,
      cross_origin_authentication: false,
      custom_login_page_on: false,
      global: false,
      is_first_party: false,
      name: "app",
      oidc_conformant: true,
      require_proof_of_possession: false,
      require_pushed_authorization_requests: false,
      sso: false,
      sso_disabled: true,
      callbacks: [],
      allowed_logout_urls: [],
      allowed_origins: [],
      web_origins: [],
    });
    expect(created_at).toBeTypeOf("string");
    expect(updated_at).toBeTypeOf("string");
    expect(client_secret).toBeTypeOf("string");
    expect(client_id).toBeTypeOf("string");

    // --------------------------------------------
    // PATCH
    // --------------------------------------------
    const patchResult = await managementClient.clients[":id"].$patch(
      {
        param: {
          id: client_id,
        },
        json: {
          name: "new name",
          client_metadata: {
            email_validation: "disabled",
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

    expect(patchResult.status).toBe(200);
    const patchedClient = await patchResult.json();
    expect(patchedClient.name).toBe("new name");
    expect(patchedClient.client_metadata?.email_validation).toBe("disabled");

    // --------------------------------------------
    // GET
    // --------------------------------------------
    const getResponse = await managementClient.clients[":id"].$get(
      {
        param: {
          id: client_id,
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

    expect(getResponse.status).toBe(200);

    // --------------------------------------------
    // DELETE
    // --------------------------------------------
    const deleteResponse = await managementClient.clients[":id"].$delete(
      {
        param: {
          id: client_id,
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
    expect(deleteResponse.status).toBe(200);

    // --------------------------------------------
    // GET 404
    // --------------------------------------------
    const get404Response = await managementClient.clients[":id"].$get(
      {
        param: {
          id: client_id,
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

  it("should get and update client connections", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();

    // Create a client
    const createClientResponse = await managementClient.clients.$post(
      {
        json: {
          client_id: "test-client",
          name: "Test Client",
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
    const client = (await createClientResponse.json()) as Client;

    // Create connections
    const createConn1Response = await managementClient.connections.$post(
      {
        json: {
          name: "connection-1",
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

    expect(createConn1Response.status).toBe(201);
    const conn1 = (await createConn1Response.json()) as Connection;

    const createConn2Response = await managementClient.connections.$post(
      {
        json: {
          name: "connection-2",
          strategy: "google-oauth2",
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

    expect(createConn2Response.status).toBe(201);
    const conn2 = (await createConn2Response.json()) as Connection;

    // GET /clients/:id/connections - should return all connections when none are explicitly defined
    const getConnectionsResponse = await managementClient.clients[":id"][
      "connections"
    ].$get(
      {
        param: {
          id: client.client_id,
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

    expect(getConnectionsResponse.status).toBe(200);
    const connectionsResult = (await getConnectionsResponse.json()) as {
      enabled_connections: Array<{
        connection_id: string;
        connection?: Connection;
      }>;
    };
    // When no connections are defined, all available connections are returned
    // There are 2 pre-existing connections (email, Username-Password-Authentication) plus the 2 we created
    expect(connectionsResult.enabled_connections.length).toBeGreaterThanOrEqual(
      2,
    );
    // Verify our created connections are in the list
    const connectionIds = connectionsResult.enabled_connections.map(
      (c) => c.connection_id,
    );
    expect(connectionIds).toContain(conn1.id);
    expect(connectionIds).toContain(conn2.id);

    // PATCH /clients/:id/connections - set connections (ordered array)
    const patchConnectionsResponse = await managementClient.clients[":id"][
      "connections"
    ].$patch(
      {
        param: {
          id: client.client_id,
        },
        json: [conn1.id, conn2.id],
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

    expect(patchConnectionsResponse.status).toBe(200);
    const patchResult = (await patchConnectionsResponse.json()) as {
      enabled_connections: Array<{
        connection_id: string;
        connection?: Connection;
      }>;
    };
    expect(patchResult.enabled_connections).toHaveLength(2);
    // Verify order is preserved
    expect(patchResult.enabled_connections[0].connection_id).toBe(conn1.id);
    expect(patchResult.enabled_connections[1].connection_id).toBe(conn2.id);

    // GET /clients/:id/connections - should now have two connections
    const getConnectionsResponse2 = await managementClient.clients[":id"][
      "connections"
    ].$get(
      {
        param: {
          id: client.client_id,
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

    expect(getConnectionsResponse2.status).toBe(200);
    const connectionsResult2 = (await getConnectionsResponse2.json()) as {
      enabled_connections: Array<{
        connection_id: string;
        connection?: Connection;
      }>;
    };
    expect(connectionsResult2.enabled_connections).toHaveLength(2);
    expect(
      connectionsResult2.enabled_connections.map((c) => c.connection_id),
    ).toEqual([conn1.id, conn2.id]);

    // Verify connections have full details
    expect(connectionsResult2.enabled_connections[0].connection).toBeDefined();
    expect(
      connectionsResult2.enabled_connections[0].connection?.strategy,
    ).toBeDefined();

    // PATCH /clients/:id/connections - remove one connection (only include conn2)
    const patchConnectionsResponse2 = await managementClient.clients[":id"][
      "connections"
    ].$patch(
      {
        param: {
          id: client.client_id,
        },
        json: [conn2.id],
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

    expect(patchConnectionsResponse2.status).toBe(200);

    // GET /clients/:id/connections - should now have only one connection
    const getConnectionsResponse3 = await managementClient.clients[":id"][
      "connections"
    ].$get(
      {
        param: {
          id: client.client_id,
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

    expect(getConnectionsResponse3.status).toBe(200);
    const connectionsResult3 = (await getConnectionsResponse3.json()) as {
      enabled_connections: Array<{
        connection_id: string;
        connection?: Connection;
      }>;
    };
    expect(connectionsResult3.enabled_connections).toHaveLength(1);
    expect(connectionsResult3.enabled_connections[0].connection_id).toBe(
      conn2.id,
    );
  });
});
