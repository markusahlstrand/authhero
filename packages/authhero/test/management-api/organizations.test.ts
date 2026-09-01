import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../helpers/token";
import { getTestServer } from "../helpers/test-server";
import type { Bindings } from "../../src/types";

// The single-organization endpoints (get/patch/delete), the member
// add/list/remove happy paths, the org-scoped member roles and tenant
// isolation had no coverage — test/routes/management-api/organizations.spec.ts
// only exercises list, create and the members 404s.

async function seedTenant(env: Bindings, tenantId: string) {
  await env.data.tenants.create({
    id: tenantId,
    friendly_name: "Organizations Tenant",
    audience: "https://example.com",
    default_audience: "https://example.com",
    sender_email: "login@example.com",
    sender_name: "SenderName",
  });
}

async function seedUser(env: Bindings, tenantId: string, userId: string) {
  return env.data.users.create(tenantId, {
    email: `${userId.replace(/[^a-z0-9]/gi, "-")}@example.com`,
    user_id: userId,
    provider: "email",
    connection: "email",
    email_verified: true,
    is_social: false,
  });
}

describe("GET /organizations/{id}", () => {
  it("returns the organization", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `org-get-${Date.now()}`;
    await seedTenant(env, tenantId);
    const organization = await env.data.organizations.create(tenantId, {
      name: "acme",
      display_name: "Acme Inc",
    });

    const response = await client.organizations[":id"].$get(
      {
        param: { id: organization.id },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      id: organization.id,
      name: "acme",
      display_name: "Acme Inc",
    });
  });

  it("resolves an organization by name as well as by id", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `org-get-by-name-${Date.now()}`;
    await seedTenant(env, tenantId);
    const organization = await env.data.organizations.create(tenantId, {
      name: "acme-by-name",
    });

    // Auth0 accepts the organization name wherever an id is expected.
    const response = await client.organizations[":id"].$get(
      {
        param: { id: "acme-by-name" },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(organization.id);
  });

  it("returns 404 for an unknown organization", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const response = await client.organizations[":id"].$get(
      {
        param: { id: "org_does_not_exist" },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(404);
  });

  it("does not leak organizations across tenants", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const ownerTenant = `org-owner-${Date.now()}`;
    const otherTenant = `org-other-${Date.now()}`;
    await seedTenant(env, ownerTenant);
    await seedTenant(env, otherTenant);

    const organization = await env.data.organizations.create(ownerTenant, {
      name: "tenant-scoped",
    });

    const getResponse = await client.organizations[":id"].$get(
      {
        param: { id: organization.id },
        header: { "tenant-id": otherTenant },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(getResponse.status).toBe(404);

    const listResponse = await client.organizations.$get(
      {
        query: {},
        header: { "tenant-id": otherTenant },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(listResponse.status).toBe(200);
    const organizations = await listResponse.json();
    expect(organizations).toEqual([]);
  });
});

describe("PATCH /organizations/{id}", () => {
  it("updates the organization and returns the new state", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `org-patch-${Date.now()}`;
    await seedTenant(env, tenantId);
    const organization = await env.data.organizations.create(tenantId, {
      name: "patch-me",
      display_name: "Before",
    });

    const response = await client.organizations[":id"].$patch(
      {
        param: { id: organization.id },
        json: {
          display_name: "After",
          branding: { logo_url: "https://example.com/logo.png" },
        },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.display_name).toBe("After");
    expect(body.branding?.logo_url).toBe("https://example.com/logo.png");

    const persisted = await env.data.organizations.get(
      tenantId,
      organization.id,
    );
    expect(persisted?.display_name).toBe("After");
  });

  it("returns 404 for an unknown organization", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const response = await client.organizations[":id"].$patch(
      {
        param: { id: "org_does_not_exist" },
        json: { display_name: "Nope" },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(404);
  });
});

describe("DELETE /organizations/{id}", () => {
  it("deletes the organization", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `org-delete-${Date.now()}`;
    await seedTenant(env, tenantId);
    const organization = await env.data.organizations.create(tenantId, {
      name: "delete-me",
    });

    const response = await client.organizations[":id"].$delete(
      {
        param: { id: organization.id },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    expect(await env.data.organizations.get(tenantId, organization.id)).toBe(
      null,
    );
  });

  it("returns 404 for an unknown organization", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const response = await client.organizations[":id"].$delete(
      {
        param: { id: "org_does_not_exist" },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(404);
  });
});

describe("organization members", () => {
  it("adds, lists and removes members", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `org-members-${Date.now()}`;
    await seedTenant(env, tenantId);
    const organization = await env.data.organizations.create(tenantId, {
      name: "members-crud",
    });
    await seedUser(env, tenantId, "email|member-a");
    await seedUser(env, tenantId, "email|member-b");

    const addResponse = await client.organizations[":id"].members.$post(
      {
        param: { id: organization.id },
        json: { members: ["email|member-a", "email|member-b"] },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(addResponse.status).toBe(204);

    const listResponse = await client.organizations[":id"].members.$get(
      {
        param: { id: organization.id },
        query: {},
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(listResponse.status).toBe(200);
    const members = await listResponse.json();
    expect(Array.isArray(members)).toBe(true);
    expect(
      (members as Array<{ user_id: string }>).map((m) => m.user_id).sort(),
    ).toEqual(["email|member-a", "email|member-b"]);
    // Members with no picture of their own fall back to a generated avatar.
    for (const member of members as Array<{ picture?: string }>) {
      expect(member.picture).toBeTruthy();
    }

    const removeResponse = await client.organizations[":id"].members.$delete(
      {
        param: { id: organization.id },
        json: { members: ["email|member-a"] },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(removeResponse.status).toBe(200);

    const afterResponse = await client.organizations[":id"].members.$get(
      {
        param: { id: organization.id },
        query: {},
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    const remaining = (await afterResponse.json()) as Array<{
      user_id: string;
    }>;
    expect(remaining.map((m) => m.user_id)).toEqual(["email|member-b"]);
  });

  it("is idempotent when the same member is added twice", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `org-members-idem-${Date.now()}`;
    await seedTenant(env, tenantId);
    const organization = await env.data.organizations.create(tenantId, {
      name: "members-idempotent",
    });
    await seedUser(env, tenantId, "email|member-dup");

    for (let i = 0; i < 2; i++) {
      const response = await client.organizations[":id"].members.$post(
        {
          param: { id: organization.id },
          json: { members: ["email|member-dup"] },
          header: { "tenant-id": tenantId },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );
      expect(response.status).toBe(204);
    }

    const listResponse = await client.organizations[":id"].members.$get(
      {
        param: { id: organization.id },
        query: {},
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    const members = (await listResponse.json()) as unknown[];
    expect(members).toHaveLength(1);
  });

  it("returns the totals envelope when include_totals is set", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `org-members-totals-${Date.now()}`;
    await seedTenant(env, tenantId);
    const organization = await env.data.organizations.create(tenantId, {
      name: "members-totals",
    });
    await seedUser(env, tenantId, "email|totals-a");
    await env.data.userOrganizations.create(tenantId, {
      user_id: "email|totals-a",
      organization_id: organization.id,
    });

    const response = await client.organizations[":id"].members.$get(
      {
        param: { id: organization.id },
        query: { include_totals: "true", page: "0", per_page: "10" },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ start: 0, limit: 10, total: 1 });
    expect((body as { members: unknown[] }).members).toHaveLength(1);
  });

  it("returns 404 when listing members of an unknown organization", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const response = await client.organizations[":id"].members.$get(
      {
        param: { id: "org_does_not_exist" },
        query: {},
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(404);
  });
});

describe("organization member roles", () => {
  it("assigns, lists and removes org-scoped roles", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `org-member-roles-${Date.now()}`;
    await seedTenant(env, tenantId);
    const organization = await env.data.organizations.create(tenantId, {
      name: "member-roles",
    });
    await seedUser(env, tenantId, "email|role-holder");
    await env.data.userOrganizations.create(tenantId, {
      user_id: "email|role-holder",
      organization_id: organization.id,
    });
    const role = await env.data.roles.create(tenantId, {
      name: "org-admin",
      description: "Organization administrator",
    });

    const assignResponse = await client.organizations[":id"].members[
      ":user_id"
    ].roles.$post(
      {
        param: { id: organization.id, user_id: "email|role-holder" },
        json: { roles: [role.id] },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(assignResponse.status).toBe(204);

    const listResponse = await client.organizations[":id"].members[
      ":user_id"
    ].roles.$get(
      {
        param: { id: organization.id, user_id: "email|role-holder" },
        query: {},
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(listResponse.status).toBe(200);
    const roles = (await listResponse.json()) as Array<{ id: string }>;
    expect(roles.map((r) => r.id)).toEqual([role.id]);

    // The role is org-scoped, so it must not show up as a global role.
    const globalRoles = await env.data.userRoles.list(
      tenantId,
      "email|role-holder",
      undefined,
      "",
    );
    expect(globalRoles).toEqual([]);

    const removeResponse = await client.organizations[":id"].members[
      ":user_id"
    ].roles.$delete(
      {
        param: { id: organization.id, user_id: "email|role-holder" },
        json: { roles: [role.id] },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(removeResponse.status).toBe(200);

    const afterResponse = await client.organizations[":id"].members[
      ":user_id"
    ].roles.$get(
      {
        param: { id: organization.id, user_id: "email|role-holder" },
        query: {},
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(await afterResponse.json()).toEqual([]);
  });

  it("returns 400 for an unknown role and 404 for an unknown user", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `org-member-roles-errors-${Date.now()}`;
    await seedTenant(env, tenantId);
    const organization = await env.data.organizations.create(tenantId, {
      name: "member-roles-errors",
    });
    await seedUser(env, tenantId, "email|known-user");

    const unknownRole = await client.organizations[":id"].members[
      ":user_id"
    ].roles.$post(
      {
        param: { id: organization.id, user_id: "email|known-user" },
        json: { roles: ["role_does_not_exist"] },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(unknownRole.status).toBe(400);

    const unknownUser = await client.organizations[":id"].members[
      ":user_id"
    ].roles.$post(
      {
        param: { id: organization.id, user_id: "email|nobody" },
        json: { roles: [] },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(unknownUser.status).toBe(404);
  });
});

describe("GET /organizations/{id}/roles", () => {
  it("lists the roles available in the tenant", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `org-roles-${Date.now()}`;
    await seedTenant(env, tenantId);
    const organization = await env.data.organizations.create(tenantId, {
      name: "org-roles",
    });
    await env.data.roles.create(tenantId, { name: "viewer" });

    const response = await client.organizations[":id"].roles.$get(
      {
        param: { id: organization.id },
        query: {},
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    const roles = (await response.json()) as Array<{ name: string }>;
    expect(roles.map((r) => r.name)).toContain("viewer");
  });

  it("returns 404 for an unknown organization", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const response = await client.organizations[":id"].roles.$get(
      {
        param: { id: "org_does_not_exist" },
        query: {},
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(404);
  });
});
