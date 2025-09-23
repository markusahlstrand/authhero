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

  describe("members", () => {
    it("should support adding and retrieving organization members", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      const token = await getAdminToken();

      // First, create an organization
      const createOrgResponse = await managementClient.organizations.$post(
        {
          json: {
            name: "Test Organization",
            display_name: "Test Organization Display",
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
      const organization = await createOrgResponse.json();

      // Create test users
      const createUser1Response = await managementClient.users.$post(
        {
          json: {
            email: "user1@example.com",
            name: "User One",
            picture: "https://example.com/user1.jpg",
            connection: "email",
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

      expect(createUser1Response.status).toBe(201);
      const user1 = await createUser1Response.json();

      const createUser2Response = await managementClient.users.$post(
        {
          json: {
            email: "user2@example.com",
            name: "User Two",
            connection: "email",
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

      expect(createUser2Response.status).toBe(201);
      const user2 = await createUser2Response.json();

      // Add users to organization
      const addMembersResponse = await managementClient.organizations[
        ":id"
      ].members.$post(
        {
          param: {
            id: organization.id,
          },
          json: {
            members: [user1.user_id, user2.user_id],
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

      expect(addMembersResponse.status).toBe(204);

      // Get organization members (simple array)
      const getMembersResponse = await managementClient.organizations[
        ":id"
      ].members.$get(
        {
          param: {
            id: organization.id,
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

      expect(getMembersResponse.status).toBe(200);
      const members = await getMembersResponse.json();

      expect(Array.isArray(members)).toBe(true);
      expect(members).toHaveLength(2);

      // Check first member
      const member1 = members.find((m: any) => m.user_id === user1.user_id);
      expect(member1).toBeDefined();
      expect(member1.email).toBe("user1@example.com");
      expect(member1.name).toBe("User One");
      expect(member1.picture).toBe("https://example.com/user1.jpg");
      expect(member1.roles).toEqual([]);

      // Check second member
      const member2 = members.find((m: any) => m.user_id === user2.user_id);
      expect(member2).toBeDefined();
      expect(member2.email).toBe("user2@example.com");
      expect(member2.name).toBe("User Two");
      expect(member2.picture).toBeUndefined();
      expect(member2.roles).toEqual([]);
    });

    it("should support paginated organization members with totals", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      const token = await getAdminToken();

      // Create an organization
      const createOrgResponse = await managementClient.organizations.$post(
        {
          json: {
            name: "Test Organization",
            display_name: "Test Organization Display",
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
      const organization = await createOrgResponse.json();

      // Create multiple test users
      const users: any[] = [];
      for (let i = 1; i <= 5; i++) {
        const createUserResponse = await managementClient.users.$post(
          {
            json: {
              email: `user${i}@example.com`,
              name: `User ${i}`,
              connection: "email",
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

        expect(createUserResponse.status).toBe(201);
        const user = await createUserResponse.json();
        users.push(user);
      }

      // Add all users to organization
      const addMembersResponse = await managementClient.organizations[
        ":id"
      ].members.$post(
        {
          param: {
            id: organization.id,
          },
          json: {
            users: users.map((u) => u.user_id),
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

      expect(addMembersResponse.status).toBe(204);

      // Get organization members with pagination and totals
      const getMembersResponse = await managementClient.organizations[
        ":id"
      ].members.$get(
        {
          param: {
            id: organization.id,
          },
          query: {
            page: "0",
            per_page: "2",
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

      expect(getMembersResponse.status).toBe(200);
      const response = await getMembersResponse.json();

      expect(response.start).toBe(0);
      expect(response.limit).toBe(2);
      expect(response.total).toBe(5);
      expect(Array.isArray(response.members)).toBe(true);
      expect(response.members).toHaveLength(2);

      // Test second page
      const getSecondPageResponse = await managementClient.organizations[
        ":id"
      ].members.$get(
        {
          param: {
            id: organization.id,
          },
          query: {
            page: "1",
            per_page: "2",
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

      expect(getSecondPageResponse.status).toBe(200);
      const secondPageResponse = await getSecondPageResponse.json();

      expect(secondPageResponse.start).toBe(2);
      expect(secondPageResponse.limit).toBe(2);
      expect(secondPageResponse.total).toBe(5);
      expect(secondPageResponse.members).toHaveLength(2);
    });

    it("should support removing organization members", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      const token = await getAdminToken();

      // Create an organization
      const createOrgResponse = await managementClient.organizations.$post(
        {
          json: {
            name: "Test Organization",
            display_name: "Test Organization Display",
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
      const organization = await createOrgResponse.json();

      // Create test users
      const createUser1Response = await managementClient.users.$post(
        {
          json: {
            email: "user1@example.com",
            name: "User One",
            connection: "email",
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

      expect(createUser1Response.status).toBe(201);
      const user1 = await createUser1Response.json();

      const createUser2Response = await managementClient.users.$post(
        {
          json: {
            email: "user2@example.com",
            name: "User Two",
            connection: "email",
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

      expect(createUser2Response.status).toBe(201);
      const user2 = await createUser2Response.json();

      // Add users to organization
      await managementClient.organizations[":id"].members.$post(
        {
          param: {
            id: organization.id,
          },
          json: {
            members: [user1.user_id, user2.user_id],
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

      // Verify both users are members
      const getInitialMembersResponse = await managementClient.organizations[
        ":id"
      ].members.$get(
        {
          param: {
            id: organization.id,
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

      expect(getInitialMembersResponse.status).toBe(200);
      const initialMembers = await getInitialMembersResponse.json();
      expect(initialMembers).toHaveLength(2);

      // Remove one user from organization
      const removeMembersResponse = await managementClient.organizations[
        ":id"
      ].members.$delete(
        {
          param: {
            id: organization.id,
          },
          json: {
            members: [user1.user_id],
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

      expect(removeMembersResponse.status).toBe(200);

      // Verify only one user remains
      const getFinalMembersResponse = await managementClient.organizations[
        ":id"
      ].members.$get(
        {
          param: {
            id: organization.id,
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

      expect(getFinalMembersResponse.status).toBe(200);
      const finalMembers = await getFinalMembersResponse.json();
      expect(finalMembers).toHaveLength(1);
      expect(finalMembers[0].user_id).toBe(user2.user_id);
    });

    it("should handle organization not found for members endpoints", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      const token = await getAdminToken();

      // Try to get members for non-existent organization
      const getMembersResponse = await managementClient.organizations[
        ":id"
      ].members.$get(
        {
          param: {
            id: "non-existent-org",
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

      expect(getMembersResponse.status).toBe(404);

      // Try to add members to non-existent organization
      const addMembersResponse = await managementClient.organizations[
        ":id"
      ].members.$post(
        {
          param: {
            id: "non-existent-org",
          },
          json: {
            members: ["user123"],
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

      expect(addMembersResponse.status).toBe(404);

      // Try to remove members from non-existent organization
      const removeMembersResponse = await managementClient.organizations[
        ":id"
      ].members.$delete(
        {
          param: {
            id: "non-existent-org",
          },
          json: {
            members: ["user123"],
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

      expect(removeMembersResponse.status).toBe(404);
    });

    it("should handle adding duplicate members gracefully", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      const token = await getAdminToken();

      // Create an organization
      const createOrgResponse = await managementClient.organizations.$post(
        {
          json: {
            name: "Test Organization",
            display_name: "Test Organization Display",
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
      const organization = await createOrgResponse.json();

      // Create a test user
      const createUserResponse = await managementClient.users.$post(
        {
          json: {
            email: "user@example.com",
            name: "Test User",
            connection: "email",
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

      expect(createUserResponse.status).toBe(201);
      const user = await createUserResponse.json();

      // Add user to organization first time
      const addMembersResponse1 = await managementClient.organizations[
        ":id"
      ].members.$post(
        {
          param: {
            id: organization.id,
          },
          json: {
            members: [user.user_id],
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

      expect(addMembersResponse1.status).toBe(204);

      // Add same user to organization again (should not create duplicate)
      const addMembersResponse2 = await managementClient.organizations[
        ":id"
      ].members.$post(
        {
          param: {
            id: organization.id,
          },
          json: {
            members: [user.user_id],
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

      expect(addMembersResponse2.status).toBe(204);

      // Verify only one member exists
      const getMembersResponse = await managementClient.organizations[
        ":id"
      ].members.$get(
        {
          param: {
            id: organization.id,
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

      expect(getMembersResponse.status).toBe(200);
      const members = await getMembersResponse.json();
      expect(members).toHaveLength(1);
      expect(members[0].user_id).toBe(user.user_id);
    });

    it("should handle removing non-existent members gracefully", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      const token = await getAdminToken();

      // Create an organization
      const createOrgResponse = await managementClient.organizations.$post(
        {
          json: {
            name: "Test Organization",
            display_name: "Test Organization Display",
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
      const organization = await createOrgResponse.json();

      // Try to remove non-existent user from organization
      const removeMembersResponse = await managementClient.organizations[
        ":id"
      ].members.$delete(
        {
          param: {
            id: organization.id,
          },
          json: {
            members: ["non-existent-user-id"],
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

      expect(removeMembersResponse.status).toBe(200);
    });

    it("should return organization members with correct payload format", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      const token = await getAdminToken();

      // Create an organization
      const createOrgResponse = await managementClient.organizations.$post(
        {
          json: {
            name: "Test Organization",
            display_name: "Test Organization Display",
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
      const organization = await createOrgResponse.json();

      // Create a user
      const createUserResponse = await managementClient.users.$post(
        {
          json: {
            email: "test@example.com",
            email_verified: true,
            connection: "Username-Password-Authentication",
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

      expect(createUserResponse.status).toBe(201);
      const user = await createUserResponse.json();

      // Add user to organization
      const addMembersResponse = await managementClient.organizations[
        ":id"
      ].members.$post(
        {
          param: {
            id: organization.id,
          },
          json: {
            members: [user.user_id],
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

      expect(addMembersResponse.status).toBe(204);

      // Test simple array response (without include_totals)
      const getMembersResponse = await managementClient.organizations[
        ":id"
      ].members.$get(
        {
          param: {
            id: organization.id,
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

      expect(getMembersResponse.status).toBe(200);
      const members = await getMembersResponse.json();

      // Should return simple array format
      expect(Array.isArray(members)).toBe(true);
      expect(members).toHaveLength(1);
      expect(members[0]).toEqual({
        user_id: user.user_id,
        email: "test@example.com",
        roles: [],
      });

      // Test paginated response (with include_totals)
      const getMembersPaginatedResponse = await managementClient.organizations[
        ":id"
      ].members.$get(
        {
          param: {
            id: organization.id,
          },
          query: {
            include_totals: "true",
            page: "0",
            per_page: "25",
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

      expect(getMembersPaginatedResponse.status).toBe(200);
      const paginatedMembers = await getMembersPaginatedResponse.json();

      // Should return paginated format matching the payload structure
      expect(paginatedMembers).toEqual({
        start: 0,
        limit: 25,
        total: 1,
        members: [
          {
            user_id: user.user_id,
            email: "test@example.com",
            roles: [],
          },
        ],
      });
    });
  });
});
