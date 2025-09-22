import { describe, it, expect, beforeEach } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";

describe("resource-servers", () => {
  let managementClient: any;
  let token: string;

  beforeEach(async () => {
    const { managementApp, env } = await getTestServer();
    managementClient = testClient(managementApp, env);
    token = await getAdminToken();
  });

  it("should support CRUD operations", async () => {
    // --------------------------------------------
    // CREATE
    // --------------------------------------------
    const createResourceServerResponse = await managementClient[
      "resource-servers"
    ].$post(
      {
        json: {
          identifier: "https://api.example.com",
          name: "Test API",
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
          signing_alg: "RS256",
          signing_secret: "test-secret",
          allow_offline_access: true,
          token_lifetime: 3600,
          token_lifetime_for_web: 7200,
          skip_consent_for_verifiable_first_party_clients: true,
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

    expect(createdResourceServer.identifier).toBe("https://api.example.com");
    expect(createdResourceServer.name).toBe("Test API");
    expect(createdResourceServer.scopes).toHaveLength(2);
    expect(createdResourceServer.signing_alg).toBe("RS256");
    expect(createdResourceServer.allow_offline_access).toBe(true);
    expect(createdResourceServer.token_lifetime).toBe(3600);
    expect(createdResourceServer.token_lifetime_for_web).toBe(7200);
    expect(
      createdResourceServer.skip_consent_for_verifiable_first_party_clients,
    ).toBe(true);
    expect(createdResourceServer.id).toBeTruthy(); // Make sure it has an ID

    // Verify scopes structure
    const readScope = createdResourceServer.scopes.find(
      (s: any) => s.value === "read:users",
    );
    const writeScope = createdResourceServer.scopes.find(
      (s: any) => s.value === "write:users",
    );
    expect(readScope.description).toBe("Read user information");
    expect(writeScope.description).toBe("Write user information");

    // --------------------------------------------
    // GET by identifier
    // --------------------------------------------
    const getResourceServerResponse = await managementClient[
      "resource-servers"
    ][":id"].$get(
      {
        param: {
          id: createdResourceServer.id, // Use the generated ID, not the identifier
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

    expect(getResourceServerResponse.status).toBe(200);
    if (getResourceServerResponse.status !== 200) {
      console.error(
        "GET resource server failed:",
        await getResourceServerResponse.text(),
      );
    }
    const fetchedResourceServer = await getResourceServerResponse.json();
    expect(fetchedResourceServer.identifier).toBe("https://api.example.com");
    expect(fetchedResourceServer.name).toBe("Test API");

    // --------------------------------------------
    // PATCH (Update)
    // --------------------------------------------
    const patchResourceServerResponse = await managementClient[
      "resource-servers"
    ][":id"].$patch(
      {
        param: {
          id: createdResourceServer.id, // Use the generated ID
        },
        json: {
          name: "Updated Test API",
          token_lifetime: 7200,
          scopes: [
            {
              value: "read:users",
              description: "Updated: Read user information",
            },
            {
              value: "write:users",
              description: "Updated: Write user information",
            },
            {
              value: "delete:users",
              description: "Delete user information",
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

    expect(patchResourceServerResponse.status).toBe(200);
    const patchedResourceServer = await patchResourceServerResponse.json();
    expect(patchedResourceServer.name).toBe("Updated Test API");
    expect(patchedResourceServer.token_lifetime).toBe(7200);
    expect(patchedResourceServer.scopes).toHaveLength(3);

    // Verify updated scopes
    const updatedReadScope = patchedResourceServer.scopes.find(
      (s: any) => s.value === "read:users",
    );
    const deleteScope = patchedResourceServer.scopes.find(
      (s: any) => s.value === "delete:users",
    );
    expect(updatedReadScope.description).toBe("Updated: Read user information");
    expect(deleteScope.description).toBe("Delete user information");

    // --------------------------------------------
    // LIST
    // --------------------------------------------
    const listResourceServersResponse = await managementClient[
      "resource-servers"
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

    expect(listResourceServersResponse.status).toBe(200);
    const resourceServersList = await listResourceServersResponse.json();
    expect(Array.isArray(resourceServersList)).toBe(true);
    expect(resourceServersList.length).toBeGreaterThan(0);

    // Should find our created resource server
    const ourResourceServer = resourceServersList.find(
      (rs: any) => rs.identifier === "https://api.example.com",
    );
    expect(ourResourceServer).toBeDefined();
    expect(ourResourceServer.name).toBe("Updated Test API");

    // --------------------------------------------
    // LIST with include_totals
    // --------------------------------------------
    const listResourceServersWithTotalsResponse = await managementClient[
      "resource-servers"
    ].$get(
      {
        query: {
          include_totals: "true",
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

    expect(listResourceServersWithTotalsResponse.status).toBe(200);
    const resourceServersListWithTotals =
      await listResourceServersWithTotalsResponse.json();
    expect(resourceServersListWithTotals).toHaveProperty("resource_servers");
    expect(resourceServersListWithTotals).toHaveProperty("start");
    expect(resourceServersListWithTotals).toHaveProperty("limit");
    expect(resourceServersListWithTotals).toHaveProperty("length");
    expect(Array.isArray(resourceServersListWithTotals.resource_servers)).toBe(
      true,
    );

    // --------------------------------------------
    // LIST with pagination
    // --------------------------------------------
    const listResourceServersWithPaginationResponse = await managementClient[
      "resource-servers"
    ].$get(
      {
        query: {
          page: "0",
          per_page: "10",
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

    expect(listResourceServersWithPaginationResponse.status).toBe(200);
    const resourceServersPaginated =
      await listResourceServersWithPaginationResponse.json();
    expect(Array.isArray(resourceServersPaginated)).toBe(true);

    // --------------------------------------------
    // DELETE
    // --------------------------------------------
    const deleteResourceServerResponse = await managementClient[
      "resource-servers"
    ][":id"].$delete(
      {
        param: {
          id: createdResourceServer.id, // Use the generated ID
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

    expect(deleteResourceServerResponse.status).toBe(200);

    // --------------------------------------------
    // GET 404 after deletion
    // --------------------------------------------
    const get404Response = await managementClient["resource-servers"][
      ":id"
    ].$get(
      {
        param: {
          id: createdResourceServer.id, // Use the generated ID
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

  it("should handle resource server with minimal fields", async () => {
    // Create with only required fields
    const createResponse = await managementClient["resource-servers"].$post(
      {
        json: {
          identifier: "https://minimal-api.example.com",
          name: "Minimal API",
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

    expect(createResponse.status).toBe(201);
    const createdResourceServer = await createResponse.json();

    expect(createdResourceServer.identifier).toBe(
      "https://minimal-api.example.com",
    );
    expect(createdResourceServer.name).toBe("Minimal API");
    // Should have default values or be null/undefined for optional fields
    expect(createdResourceServer.scopes || []).toEqual([]); // Handle both undefined and empty array

    // Clean up
    await managementClient["resource-servers"][":id"].$delete(
      {
        param: {
          id: createdResourceServer.id, // Use the generated ID
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

  it("should return 404 for non-existent resource server operations", async () => {
    const nonExistentId = "https://non-existent.example.com";

    // GET non-existent resource server
    const getResponse = await managementClient["resource-servers"][":id"].$get(
      {
        param: {
          id: nonExistentId,
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
    expect(getResponse.status).toBe(404);

    // PATCH non-existent resource server
    const patchResponse = await managementClient["resource-servers"][
      ":id"
    ].$patch(
      {
        param: {
          id: nonExistentId,
        },
        json: {
          name: "Updated Name",
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
    expect(patchResponse.status).toBe(404);

    // DELETE non-existent resource server
    const deleteResponse = await managementClient["resource-servers"][
      ":id"
    ].$delete(
      {
        param: {
          id: nonExistentId,
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
    expect(deleteResponse.status).toBe(404);
  });

  it("should handle search and filtering", async () => {
    // Create a couple of resource servers for search testing
    const rs1Response = await managementClient["resource-servers"].$post(
      {
        json: {
          identifier: "https://search-test-1.example.com",
          name: "Search Test API 1",
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

    const rs2Response = await managementClient["resource-servers"].$post(
      {
        json: {
          identifier: "https://search-test-2.example.com",
          name: "Different API Name",
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

    const rs1 = await rs1Response.json();
    const rs2 = await rs2Response.json();

    // Test search by name
    const searchResponse = await managementClient["resource-servers"].$get(
      {
        query: {
          q: "Search Test",
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

    expect(searchResponse.status).toBe(200);
    const searchResults = await searchResponse.json();
    expect(Array.isArray(searchResults)).toBe(true);

    // Should find the resource server with "Search Test" in the name
    const foundRS = searchResults.find(
      (rs: any) => rs.identifier === "https://search-test-1.example.com",
    );
    expect(foundRS).toBeDefined();

    // Clean up
    await managementClient["resource-servers"][":id"].$delete(
      {
        param: {
          id: rs1.id, // Use the generated ID
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
          id: rs2.id, // Use the generated ID
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

  it("should persist allow_offline_access and enforce_policies properties correctly through API", async () => {
    // --------------------------------------------
    // CREATE with initial property values
    // --------------------------------------------
    const createResponse = await managementClient["resource-servers"].$post(
      {
        json: {
          identifier: "https://properties-test.example.com",
          name: "Properties Test API",
          scopes: [
            {
              value: "read:data",
              description: "Read data",
            },
          ],
          signing_alg: "RS256",
          allow_offline_access: false,
          options: {
            enforce_policies: false,
            allow_skipping_userinfo: true,
            persist_client_authorization: true,
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

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created.allow_offline_access).toBe(false);
    expect(created.options?.enforce_policies).toBe(false);
    expect(created.options?.allow_skipping_userinfo).toBe(true);
    expect(created.options?.persist_client_authorization).toBe(true);

    // --------------------------------------------
    // UPDATE both properties to true
    // --------------------------------------------
    const updateResponse1 = await managementClient["resource-servers"][
      ":id"
    ].$patch(
      {
        param: {
          id: created.id,
        },
        json: {
          allow_offline_access: true,
          options: {
            enforce_policies: true,
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

    expect(updateResponse1.status).toBe(200);
    const updated1 = await updateResponse1.json();
    expect(updated1.allow_offline_access).toBe(true);
    expect(updated1.options?.enforce_policies).toBe(true);
    // Should preserve other options
    expect(updated1.options?.allow_skipping_userinfo).toBe(true);
    expect(updated1.options?.persist_client_authorization).toBe(true);

    // --------------------------------------------
    // GET to verify persistence
    // --------------------------------------------
    const getResponse = await managementClient["resource-servers"][":id"].$get(
      {
        param: {
          id: created.id,
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
    const fetched = await getResponse.json();
    expect(fetched.allow_offline_access).toBe(true);
    expect(fetched.options?.enforce_policies).toBe(true);
    expect(fetched.options?.allow_skipping_userinfo).toBe(true);
    expect(fetched.options?.persist_client_authorization).toBe(true);

    // --------------------------------------------
    // UPDATE only allow_offline_access, should preserve options
    // --------------------------------------------
    const updateResponse2 = await managementClient["resource-servers"][
      ":id"
    ].$patch(
      {
        param: {
          id: created.id,
        },
        json: {
          allow_offline_access: false,
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

    expect(updateResponse2.status).toBe(200);
    const updated2 = await updateResponse2.json();
    expect(updated2.allow_offline_access).toBe(false);
    // Should preserve all options
    expect(updated2.options?.enforce_policies).toBe(true);
    expect(updated2.options?.allow_skipping_userinfo).toBe(true);
    expect(updated2.options?.persist_client_authorization).toBe(true);

    // --------------------------------------------
    // UPDATE only enforce_policies, should preserve other properties
    // --------------------------------------------
    const updateResponse3 = await managementClient["resource-servers"][
      ":id"
    ].$patch(
      {
        param: {
          id: created.id,
        },
        json: {
          options: {
            enforce_policies: false,
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

    expect(updateResponse3.status).toBe(200);
    const updated3 = await updateResponse3.json();
    expect(updated3.allow_offline_access).toBe(false); // Should still be false
    expect(updated3.options?.enforce_policies).toBe(false);
    // Should preserve other options
    expect(updated3.options?.allow_skipping_userinfo).toBe(true);
    expect(updated3.options?.persist_client_authorization).toBe(true);

    // --------------------------------------------
    // Final GET to double-check persistence
    // --------------------------------------------
    const finalGetResponse = await managementClient["resource-servers"][
      ":id"
    ].$get(
      {
        param: {
          id: created.id,
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

    expect(finalGetResponse.status).toBe(200);
    const finalFetched = await finalGetResponse.json();
    expect(finalFetched.allow_offline_access).toBe(false);
    expect(finalFetched.options?.enforce_policies).toBe(false);
    expect(finalFetched.options?.allow_skipping_userinfo).toBe(true);
    expect(finalFetched.options?.persist_client_authorization).toBe(true);

    // --------------------------------------------
    // Clean up
    // --------------------------------------------
    const deleteResponse = await managementClient["resource-servers"][
      ":id"
    ].$delete(
      {
        param: {
          id: created.id,
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
  });
});
