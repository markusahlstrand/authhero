import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { createToken, getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";

describe("organizations management API endpoint", () => {
  describe("GET /api/v2/organizations with access:all_organizations (#1437)", () => {
    async function listWith(permissions: string[], org_id?: string) {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      await env.data.organizations.create("tenantId", { name: "publisher-a" });
      await env.data.organizations.create("tenantId", { name: "publisher-b" });
      const token = await createToken({
        tenant_id: "tenantId",
        permissions,
        org_id,
      });
      return managementClient.organizations.$get(
        { query: {}, header: { "tenant-id": "tenantId" } },
        { headers: { authorization: `Bearer ${token}` } },
      );
    }

    it("lists every organization without read:organizations", async () => {
      const response = await listWith(["access:all_organizations"]);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { name: string }[];
      const names = body.map((org) => org.name);
      expect(names).toEqual(
        expect.arrayContaining(["publisher-a", "publisher-b"]),
      );
    });

    it("is not honoured on an org-scoped token", async () => {
      const response = await listWith(
        ["access:all_organizations"],
        "org_from_an_org_role",
      );
      expect(response.status).toBe(403);
    });

    it("still lets read:organizations list on an org-scoped token", async () => {
      const response = await listWith(["read:organizations"], "org_x");
      expect(response.status).toBe(200);
    });

    it("does not open the org detail routes", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const org = await env.data.organizations.create("tenantId", {
        name: "publisher-a",
      });
      const token = await createToken({
        tenant_id: "tenantId",
        permissions: ["access:all_organizations"],
      });
      const response = await managementClient.organizations[":id"].$get(
        { param: { id: org.id }, header: { "tenant-id": "tenantId" } },
        { headers: { authorization: `Bearer ${token}` } },
      );
      expect(response.status).toBe(403);
    });
  });

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
          // from/take is how the Auth0 SDK paginates members (checkpoint).
          query: { take: "25" },
          header: { "tenant-id": tenantId },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as any;
      // Checkpoint pagination returns { members, next }, not a bare array.
      expect(data.members).toHaveLength(memberCount);
      expect(data.next).toBeUndefined(); // all fit on one page
    });

    it("walks all members across pages via the opaque next cursor", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      const tenantId = `members-cursor-${Date.now()}`;
      await env.data.tenants.create({
        id: tenantId,
        friendly_name: "Members Cursor Tenant",
        audience: "https://example.com",
        default_audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });
      const organization = await env.data.organizations.create(tenantId, {
        name: "members-cursor-org",
        display_name: "Members Cursor Org",
      });

      const memberCount = 12;
      for (let i = 0; i < memberCount; i++) {
        const userId = `email|cursor-${i}`;
        await env.data.users.create(tenantId, {
          email: `cursor-${i}@example.com`,
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

      const seen = new Set<string>();
      let from: string | undefined;
      let pages = 0;
      for (;;) {
        const res = await managementClient.organizations[":id"].members.$get(
          {
            param: { id: organization.id },
            query: from ? { take: "5", from } : { take: "5" },
            header: { "tenant-id": tenantId },
          },
          { headers: { authorization: `Bearer ${token}` } },
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        for (const m of body.members) {
          expect(seen.has(m.user_id)).toBe(false);
          seen.add(m.user_id);
        }
        pages++;
        if (!body.next) break;
        from = body.next as string;
        if (pages > 6) throw new Error("cursor walk did not terminate");
      }

      expect(seen.size).toBe(memberCount);
      expect(pages).toBe(3); // 5 + 5 + 2
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

    async function setup() {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();
      const tenantId = `members-add-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await env.data.tenants.create({
        id: tenantId,
        friendly_name: "Members Add Tenant",
        audience: "https://example.com",
        default_audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });
      const orgA = await env.data.organizations.create(tenantId, {
        name: "org-a",
        display_name: "Org A",
      });
      const orgB = await env.data.organizations.create(tenantId, {
        name: "org-b",
        display_name: "Org B",
      });
      const makeUser = async (n: string) => {
        const user_id = `email|${n}`;
        await env.data.users.create(tenantId, {
          email: `${n}@example.com`,
          user_id,
          provider: "email",
          connection: "email",
          email_verified: true,
          is_social: false,
        });
        return user_id;
      };
      const addMembers = (orgId: string, members: string[]) =>
        managementClient.organizations[":id"].members.$post(
          {
            param: { id: orgId },
            json: { members },
            header: { "tenant-id": tenantId },
          },
          { headers: { authorization: `Bearer ${token}` } },
        );
      const countFor = async (userId: string, orgId: string) => {
        const res = await env.data.userOrganizations.list(tenantId, {
          q: `user_id:${userId}`,
          per_page: 100,
        });
        return res.userOrganizations.filter(
          (uo) => uo.organization_id === orgId,
        ).length;
      };
      return { env, tenantId, orgA, orgB, makeUser, addMembers, countFor };
    }

    it("adds existing users and returns 204", async () => {
      const { orgA, makeUser, addMembers, countFor } = await setup();
      const u = await makeUser("add-ok");

      const res = await addMembers(orgA.id, [u]);

      expect(res.status).toBe(204);
      expect(await countFor(u, orgA.id)).toBe(1);
    });

    it("returns 400 and writes nothing for an unknown user id", async () => {
      const { env, tenantId, orgA, addMembers } = await setup();

      const res = await addMembers(orgA.id, ["email|ghost"]);

      expect(res.status).toBe(400);
      const rows = await env.data.userOrganizations.list(tenantId, {
        q: `organization_id:${orgA.id}`,
      });
      expect(rows.userOrganizations).toHaveLength(0);
    });

    it("rejects a mixed known/unknown batch atomically", async () => {
      const { orgA, makeUser, addMembers, countFor } = await setup();
      const known = await makeUser("mixed-known");

      const res = await addMembers(orgA.id, [known, "email|ghost"]);

      expect(res.status).toBe(400);
      expect(await countFor(known, orgA.id)).toBe(0);
    });

    it("is idempotent when the user already belongs to this and another org", async () => {
      const { orgA, orgB, makeUser, addMembers, countFor, env, tenantId } =
        await setup();
      const u = await makeUser("multi-org");
      // Add to A first, then B, so B is the user's most recent membership.
      await env.data.userOrganizations.create(tenantId, {
        user_id: u,
        organization_id: orgA.id,
      });
      await new Promise((r) => setTimeout(r, 5));
      await env.data.userOrganizations.create(tenantId, {
        user_id: u,
        organization_id: orgB.id,
      });

      const res = await addMembers(orgA.id, [u]);

      expect(res.status).toBe(204);
      expect(await countFor(u, orgA.id)).toBe(1);
      expect(await countFor(u, orgB.id)).toBe(1);
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
