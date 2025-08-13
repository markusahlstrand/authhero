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
});
