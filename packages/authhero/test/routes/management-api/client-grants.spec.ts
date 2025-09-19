import { describe, it, expect, beforeEach } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";

describe("client-grants", () => {
  let managementClient: any;
  let token: string;

  beforeEach(async () => {
    const { managementApp, env } = await getTestServer();
    managementClient = testClient(managementApp, env);
    token = await getAdminToken();
  });

  it("should support CRUD operations", async () => {
    // First create a client and resource server that we can use for the grant
    const createClientResponse = await managementClient.clients.$post(
      {
        json: {
          client_id: "test-client-for-grants",
          name: "Test Client for Grants",
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

    const createResourceServerResponse = await managementClient[
      "resource-servers"
    ].$post(
      {
        json: {
          identifier: "https://api.grants-test.com",
          name: "Test API for Grants",
          scopes: [
            {
              value: "read:users",
              description: "Read user information",
            },
            {
              value: "write:users",
              description: "Write user information",
            },
          ],
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

    expect(createResourceServerResponse.status).toBe(201);
    const createdResourceServer = await createResourceServerResponse.json();

    // --------------------------------------------
    // CREATE
    // --------------------------------------------
    const createClientGrantResponse = await managementClient[
      "client-grants"
    ].$post(
      {
        json: {
          client_id: createdClient.client_id,
          audience: createdResourceServer.identifier,
          scope: ["read:users", "write:users"],
          organization_usage: "allow",
          allow_any_organization: true,
          is_system: false,
          subject_type: "client",
          authorization_details_types: ["payment_initiation"],
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

    expect(createClientGrantResponse.status).toBe(201);
    const createdClientGrant = await createClientGrantResponse.json();
    expect(createdClientGrant.client_id).toBe(createdClient.client_id);
    expect(createdClientGrant.audience).toBe(createdResourceServer.identifier);
    expect(createdClientGrant.scope).toEqual(["read:users", "write:users"]);
    expect(createdClientGrant.organization_usage).toBe("allow");
    expect(createdClientGrant.allow_any_organization).toBe(true);
    expect(createdClientGrant.is_system).toBe(false);
    expect(createdClientGrant.subject_type).toBe("client");
    expect(createdClientGrant.authorization_details_types).toEqual([
      "payment_initiation",
    ]);

    // --------------------------------------------
    // GET
    // --------------------------------------------
    const getClientGrantResponse = await managementClient["client-grants"][
      ":id"
    ].$get(
      {
        param: {
          id: createdClientGrant.id,
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

    expect(getClientGrantResponse.status).toBe(200);
    const fetchedClientGrant = await getClientGrantResponse.json();
    expect(fetchedClientGrant.client_id).toBe(createdClient.client_id);
    expect(fetchedClientGrant.audience).toBe(createdResourceServer.identifier);

    // --------------------------------------------
    // LIST
    // --------------------------------------------
    const listClientGrantsResponse = await managementClient[
      "client-grants"
    ].$get(
      {
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

    expect(listClientGrantsResponse.status).toBe(200);
    const clientGrantsList = await listClientGrantsResponse.json();
    expect(Array.isArray(clientGrantsList)).toBe(true);
    expect(clientGrantsList.length).toBeGreaterThan(0);

    // --------------------------------------------
    // PATCH (Update)
    // --------------------------------------------
    const patchClientGrantResponse = await managementClient["client-grants"][
      ":id"
    ].$patch(
      {
        param: {
          id: createdClientGrant.id,
        },
        json: {
          scope: ["read:users"],
          organization_usage: "deny",
          allow_any_organization: false,
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

    expect(patchClientGrantResponse.status).toBe(200);
    const updatedClientGrant = await patchClientGrantResponse.json();
    expect(updatedClientGrant.scope).toEqual(["read:users"]);
    expect(updatedClientGrant.organization_usage).toBe("deny");
    expect(updatedClientGrant.allow_any_organization).toBe(false);

    // --------------------------------------------
    // DELETE
    // --------------------------------------------
    const deleteClientGrantResponse = await managementClient["client-grants"][
      ":id"
    ].$delete(
      {
        param: {
          id: createdClientGrant.id,
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

    expect(deleteClientGrantResponse.status).toBe(200);

    // --------------------------------------------
    // GET 404 after deletion
    // --------------------------------------------
    const get404Response = await managementClient["client-grants"][":id"].$get(
      {
        param: {
          id: createdClientGrant.id,
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

    // Cleanup - Delete the client and resource server
    await managementClient.clients[":id"].$delete(
      {
        param: {
          id: createdClient.client_id,
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

    await managementClient["resource-servers"][":id"].$delete(
      {
        param: {
          id: createdResourceServer.id,
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
  });
});
