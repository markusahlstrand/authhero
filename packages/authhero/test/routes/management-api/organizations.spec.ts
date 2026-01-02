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
});
