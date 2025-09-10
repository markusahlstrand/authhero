import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";

describe("organizations", () => {
  it("should support CRUD operations", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();

    // CREATE organization
    const createOrgResponse = await managementClient.organizations.$post(
      {
        json: {
          name: "Test Organization",
          display_name: "Test Organization Display",
          branding: {
            logo_url: "https://example.com/logo.png",
            colors: {
              primary: "#FF0000",
              page_background: "#FFFFFF",
            },
          },
          metadata: {
            custom_field: "custom_value",
          },
          enabled_connections: [
            {
              connection_id: "conn_123",
              assign_membership_on_login: true,
              show_as_button: true,
              is_signup_enabled: true,
            },
          ],
          token_quota: {
            client_credentials: {
              enforce: true,
              per_day: 1000,
              per_hour: 100,
            },
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

    expect(createOrgResponse.status).toBe(201);
    const createdOrg = await createOrgResponse.json();

    const { created_at, updated_at, id, ...rest } = createdOrg;

    expect(rest).toEqual({
      name: "Test Organization",
      display_name: "Test Organization Display",
      branding: {
        logo_url: "https://example.com/logo.png",
        colors: {
          primary: "#FF0000",
          page_background: "#FFFFFF",
        },
      },
      metadata: {
        custom_field: "custom_value",
      },
      enabled_connections: [
        {
          connection_id: "conn_123",
          assign_membership_on_login: true,
          show_as_button: true,
          is_signup_enabled: true,
        },
      ],
      token_quota: {
        client_credentials: {
          enforce: true,
          per_day: 1000,
          per_hour: 100,
        },
      },
    });
    expect(created_at).toBeTypeOf("string");
    expect(updated_at).toBeTypeOf("string");
    expect(id).toBeTypeOf("string");

    // GET organization
    const getOrgResponse = await managementClient.organizations[":id"].$get(
      {
        param: {
          id,
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

    expect(getOrgResponse.status).toBe(200);
    const retrievedOrg = await getOrgResponse.json();
    expect(retrievedOrg.id).toBe(id);
    expect(retrievedOrg.name).toBe("Test Organization");

    // PATCH organization
    const patchResult = await managementClient.organizations[":id"].$patch(
      {
        param: {
          id,
        },
        json: {
          name: "Updated Organization Name",
          display_name: "Updated Display Name",
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
    const updatedOrg = await patchResult.json();
    expect(updatedOrg.name).toBe("Updated Organization Name");
    expect(updatedOrg.display_name).toBe("Updated Display Name");

    // LIST organizations
    const listResult = await managementClient.organizations.$get(
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

    expect(listResult.status).toBe(200);
    const organizations = await listResult.json();
    expect(Array.isArray(organizations)).toBe(true);
    expect(organizations).toHaveLength(1);
    expect(organizations[0].id).toBe(id);

    // DELETE organization
    const deleteResult = await managementClient.organizations[":id"].$delete(
      {
        param: {
          id,
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

    expect(deleteResult.status).toBe(200);

    // Verify organization is deleted
    const getDeletedOrgResponse = await managementClient.organizations[
      ":id"
    ].$get(
      {
        param: {
          id,
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

    expect(getDeletedOrgResponse.status).toBe(404);
  });

  it("should handle organization not found", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();

    const getOrgResponse = await managementClient.organizations[":id"].$get(
      {
        param: {
          id: "non-existent-id",
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

    expect(getOrgResponse.status).toBe(404);
  });
});
