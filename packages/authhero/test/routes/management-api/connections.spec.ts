import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import { Connection } from "@authhero/adapter-interfaces";

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
    // There is a default email connection created by the test server
    expect(connections.length).toEqual(1);
  });
});
