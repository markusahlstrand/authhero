import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";

describe("organizations management API endpoint", () => {
  describe("GET /api/v2/organizations", () => {
    it("should list organizations with pagination", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      // Use a unique tenant ID for this test
      const tenantId = `pagination-test-${Date.now()}`;

      // Create test organizations
      for (let i = 0; i < 5; i++) {
        await env.data.organizations.create(tenantId, {
          name: `org-${i}`,
          display_name: `Organization ${i}`,
        });
      }

      // Test page-based pagination - first page
      const page1Response = await managementClient.organizations.$get(
        {
          query: {
            page: "0",
            per_page: "2",
            include_totals: "true",
          },
          header: {
            "tenant-id": tenantId,
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(page1Response.status).toBe(200);
      const page1Data = (await page1Response.json()) as any;
      expect(page1Data.organizations).toHaveLength(2);
      expect(page1Data.start).toBe(0);
      expect(page1Data.limit).toBe(2);
      expect(page1Data.total).toBe(5);

      // Test page-based pagination - second page
      const page2Response = await managementClient.organizations.$get(
        {
          query: {
            page: "1",
            per_page: "2",
            include_totals: "true",
          },
          header: {
            "tenant-id": tenantId,
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(page2Response.status).toBe(200);
      const page2Data = (await page2Response.json()) as any;
      expect(page2Data.organizations).toHaveLength(2);
      expect(page2Data.start).toBe(2);
      expect(page2Data.limit).toBe(2);
    });

    it("should return array directly when include_totals is false", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      // Use a unique tenant ID for this test
      const tenantId = `array-test-${Date.now()}`;

      // Create a test organization
      await env.data.organizations.create(tenantId, {
        name: "simple-org",
        display_name: "Simple Organization",
      });

      const response = await managementClient.organizations.$get(
        {
          query: {
            include_totals: "false",
          },
          header: {
            "tenant-id": tenantId,
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      // When include_totals is false, should return array directly
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe("POST /api/v2/organizations", () => {
    it("should create an organization with lowercase name", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      const tenantId = `create-test-${Date.now()}`;

      const response = await managementClient.organizations.$post(
        {
          json: {
            name: "my-org-name",
            display_name: "My Organization",
          },
          header: {
            "tenant-id": tenantId,
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(response.status).toBe(201);
      const org = (await response.json()) as any;
      expect(org.name).toBe("my-org-name");
    });

    it("should reject organization name with uppercase letters", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      const tenantId = `create-test-${Date.now()}`;

      const response = await managementClient.organizations.$post(
        {
          json: {
            name: "My-Org-Name",
            display_name: "My Organization",
          },
          header: {
            "tenant-id": tenantId,
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(response.status).toBe(400);
    });

    it("should reject organization name with spaces", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      const tenantId = `create-test-${Date.now()}`;

      const response = await managementClient.organizations.$post(
        {
          json: {
            name: "my org name",
            display_name: "My Organization",
          },
          header: {
            "tenant-id": tenantId,
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(response.status).toBe(400);
    });

    it("should allow organization name with numbers, hyphens, and underscores", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      const tenantId = `create-test-${Date.now()}`;

      const response = await managementClient.organizations.$post(
        {
          json: {
            name: "org-123_test",
            display_name: "My Organization",
          },
          header: {
            "tenant-id": tenantId,
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(response.status).toBe(201);
      const org = (await response.json()) as any;
      expect(org.name).toBe("org-123_test");
    });

    it("should honor a client-supplied id", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      const tenantId = `create-test-${Date.now()}`;

      const response = await managementClient.organizations.$post(
        {
          json: {
            id: "acme",
            name: "acme",
            display_name: "Acme",
          },
          header: {
            "tenant-id": tenantId,
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(response.status).toBe(201);
      const org = (await response.json()) as any;
      expect(org.id).toBe("acme");

      // Fetching by the supplied id should return the same organization.
      const fetched = await managementClient.organizations[":id"].$get(
        {
          param: { id: "acme" },
          header: { "tenant-id": tenantId },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );
      expect(fetched.status).toBe(200);
      const fetchedOrg = (await fetched.json()) as any;
      expect(fetchedOrg.id).toBe("acme");
    });
  });

  describe("GET /api/v2/organizations/:id/members", () => {
    it("honors the take parameter instead of capping at the per_page default", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      const tenantId = `members-take-${Date.now()}`;

      await env.data.tenants.create({
        id: tenantId,
        friendly_name: "Members Take Tenant",
        audience: "https://example.com",
        default_audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const organization = await env.data.organizations.create(tenantId, {
        name: "members-org",
        display_name: "Members Org",
      });

      // Create more members than the default per_page (10) so a regression
      // where take is ignored would surface as a truncated list.
      const memberCount = 15;
      for (let i = 0; i < memberCount; i++) {
        const userId = `email|member-${i}`;
        await env.data.users.create(tenantId, {
          email: `member-${i}@example.com`,
          user_id: userId,
          provider: "email",
          connection: "email",
          email_verified: true,
          is_social: false,
        });
        await env.data.userOrganizations.create(tenantId, {
          user_id: userId,
          organization_id: organization.id,
        });
      }

      const response = await managementClient.organizations[":id"].members.$get(
        {
          param: { id: organization.id },
          // from/take is how the Auth0 SDK paginates members.
          query: { from: "0", take: "25" },
          header: { "tenant-id": tenantId },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as any;
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(memberCount);
    });
  });

  describe("POST /api/v2/organizations/:id/members", () => {
    it("should return 404 when the organization does not exist", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      const tenantId = `members-404-${Date.now()}`;

      const response = await managementClient.organizations[
        ":id"
      ].members.$post(
        {
          param: { id: "does-not-exist" },
          json: { members: ["auth0|user1"] },
          header: { "tenant-id": tenantId },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /api/v2/organizations/:id/members", () => {
    it("should return 404 when the organization does not exist", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      const tenantId = `members-del-404-${Date.now()}`;

      const response = await managementClient.organizations[
        ":id"
      ].members.$delete(
        {
          param: { id: "does-not-exist" },
          json: { members: ["auth0|user1"] },
          header: { "tenant-id": tenantId },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
    });
  });
});
