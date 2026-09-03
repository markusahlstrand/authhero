import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../helpers/token";
import { getTestServer } from "../helpers/test-server";
import type { Bindings } from "../../src/types";

// The single-organization endpoints (get/patch/delete), the member
// add/list/remove happy paths, the org-scoped member roles and tenant
// isolation had no coverage — test/routes/management-api/organizations.spec.ts
// only exercises list, create and the members 404s.
//
// The invitations and enabled_connections routes, and the remaining member /
// member-role paths, are covered further down (the "Management API CRUD tests
// are thin" box of #1015).

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

describe("organization members (remaining paths)", () => {
  it("resolves the organization by name and stores the membership under its id", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `org-members-by-name-${Date.now()}`;
    await seedTenant(env, tenantId);
    await seedUser(env, tenantId, "email|by-name-member");
    const organization = await env.data.organizations.create(tenantId, {
      name: "by-name-org",
    });

    // `organizations.get` falls back to a name lookup for Auth0 compat, so the
    // membership must be persisted against the resolved id, not the path param.
    const response = await client.organizations[":id"].members.$post(
      {
        param: { id: "by-name-org" },
        json: { members: ["email|by-name-member"] },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(204);

    const userOrgs = await env.data.userOrganizations.list(tenantId, {
      per_page: 10,
    });
    expect(userOrgs.userOrganizations.map((uo) => uo.organization_id)).toEqual([
      organization.id,
    ]);
  });

  it("removes only the listed members", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `org-members-remove-${Date.now()}`;
    await seedTenant(env, tenantId);
    await seedUser(env, tenantId, "email|leaving-member");
    await seedUser(env, tenantId, "email|staying-member");
    const organization = await env.data.organizations.create(tenantId, {
      name: "remove-members-org",
    });

    await client.organizations[":id"].members.$post(
      {
        param: { id: organization.id },
        json: { members: ["email|leaving-member", "email|staying-member"] },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    const removeResponse = await client.organizations[":id"].members.$delete(
      {
        param: { id: organization.id },
        json: { members: ["email|leaving-member"] },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(removeResponse.status).toBe(200);

    const listResponse = await client.organizations[":id"].members.$get(
      {
        param: { id: organization.id },
        query: {},
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    const members = (await listResponse.json()) as Array<{ user_id: string }>;
    expect(members.map((m) => m.user_id)).toEqual(["email|staying-member"]);
  });

  it("removing a user that is not a member is a no-op", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `org-members-noop-${Date.now()}`;
    await seedTenant(env, tenantId);
    await seedUser(env, tenantId, "email|not-a-member");
    const organization = await env.data.organizations.create(tenantId, {
      name: "noop-members-org",
    });

    const response = await client.organizations[":id"].members.$delete(
      {
        param: { id: organization.id },
        json: { members: ["email|not-a-member"] },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
  });

  it("fails hard when a member does not exist", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `org-members-ghost-${Date.now()}`;
    await seedTenant(env, tenantId);
    const organization = await env.data.organizations.create(tenantId, {
      name: "ghost-org",
    });

    // Documents current behaviour, not desired behaviour: the handler verifies
    // the organization but never the users, so an unknown user id falls
    // through to the user_organizations foreign key and escapes as a raw
    // adapter error instead of a response. Auth0 answers 400 ("Some users do
    // not exist"). Flagged for a human on the PR — if the handler starts
    // validating members, this should become a 400 assertion.
    await expect(
      client.organizations[":id"].members.$post(
        {
          param: { id: organization.id },
          json: { members: ["email|does-not-exist"] },
          header: { "tenant-id": tenantId },
        },
        { headers: { authorization: `Bearer ${token}` } },
      ),
    ).rejects.toThrow();

    const listResponse = await client.organizations[":id"].members.$get(
      {
        param: { id: organization.id },
        query: {},
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual([]);
  });
});

describe("organization member roles (remaining paths)", () => {
  it("does not report the user's tenant-level roles as organization roles", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `org-role-scope-${Date.now()}`;
    await seedTenant(env, tenantId);
    await seedUser(env, tenantId, "email|scoped-member");
    const organization = await env.data.organizations.create(tenantId, {
      name: "scope-org",
    });
    const globalRole = await env.data.roles.create(tenantId, {
      name: "tenant-admin",
    });

    // Assigned in the global ("") scope, not in the organization.
    await env.data.userRoles.create(
      tenantId,
      "email|scoped-member",
      globalRole.id,
      "",
    );

    const response = await client.organizations[":id"].members[
      ":user_id"
    ].roles.$get(
      {
        param: { id: organization.id, user_id: "email|scoped-member" },
        query: {},
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("assigning the same role twice is idempotent", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `org-role-dup-${Date.now()}`;
    await seedTenant(env, tenantId);
    await seedUser(env, tenantId, "email|dup-role-member");
    const organization = await env.data.organizations.create(tenantId, {
      name: "dup-role-org",
    });
    const role = await env.data.roles.create(tenantId, { name: "member" });

    const assign = () =>
      client.organizations[":id"].members[":user_id"].roles.$post(
        {
          param: { id: organization.id, user_id: "email|dup-role-member" },
          json: { roles: [role.id] },
          header: { "tenant-id": tenantId },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

    expect((await assign()).status).toBe(204);
    expect((await assign()).status).toBe(204);

    const listResponse = await client.organizations[":id"].members[
      ":user_id"
    ].roles.$get(
      {
        param: { id: organization.id, user_id: "email|dup-role-member" },
        query: {},
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(await listResponse.json()).toHaveLength(1);
  });

  it("returns 404 for an unknown organization", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const listResponse = await client.organizations[":id"].members[
      ":user_id"
    ].roles.$get(
      {
        param: { id: "org_does_not_exist", user_id: "email|userId" },
        query: {},
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(listResponse.status).toBe(404);

    const removeResponse = await client.organizations[":id"].members[
      ":user_id"
    ].roles.$delete(
      {
        param: { id: "org_does_not_exist", user_id: "email|userId" },
        json: { roles: [] },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(removeResponse.status).toBe(404);
  });
});

describe("organization invitations", () => {
  const invitePayload = {
    inviter: { name: "Inviter" },
    invitee: { email: "invitee@example.com" },
    client_id: "clientId",
    send_invitation_email: false,
  };

  it("creates, lists, reads and deletes an invitation", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `org-invitations-${Date.now()}`;
    await seedTenant(env, tenantId);
    const organization = await env.data.organizations.create(tenantId, {
      name: "invite-org",
      display_name: "Invite Org",
    });

    const createResponse = await client.organizations[":id"].invitations.$post(
      {
        param: { id: organization.id },
        json: invitePayload,
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(createResponse.status).toBe(201);
    const invite = (await createResponse.json()) as {
      id: string;
      organization_id: string;
      invitation_url: string;
    };
    expect(invite.organization_id).toBe(organization.id);
    // The API layer, not the caller, owns the invitation URL.
    const invitationUrl = new URL(invite.invitation_url);
    expect(invitationUrl.pathname).toBe("/u2/accept-invitation");
    expect(invitationUrl.searchParams.get("invitation")).toBe(invite.id);
    expect(invitationUrl.searchParams.get("organization")).toBe(
      organization.id,
    );

    const listResponse = await client.organizations[":id"].invitations.$get(
      {
        param: { id: organization.id },
        query: {},
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(listResponse.status).toBe(200);
    const invitations = (await listResponse.json()) as Array<{ id: string }>;
    expect(invitations.map((i) => i.id)).toEqual([invite.id]);

    const getResponse = await client.organizations[":id"].invitations[
      ":invitation_id"
    ].$get(
      {
        param: { id: organization.id, invitation_id: invite.id },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(getResponse.status).toBe(200);
    expect(((await getResponse.json()) as { id: string }).id).toBe(invite.id);

    const deleteResponse = await client.organizations[":id"].invitations[
      ":invitation_id"
    ].$delete(
      {
        param: { id: organization.id, invitation_id: invite.id },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(deleteResponse.status).toBe(204);

    const afterResponse = await client.organizations[":id"].invitations[
      ":invitation_id"
    ].$get(
      {
        param: { id: organization.id, invitation_id: invite.id },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(afterResponse.status).toBe(404);
  });

  it("only exposes invitations belonging to the organization", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `org-invitations-filter-${Date.now()}`;
    await seedTenant(env, tenantId);
    const organization = await env.data.organizations.create(tenantId, {
      name: "filter-org",
    });
    const otherOrganization = await env.data.organizations.create(tenantId, {
      name: "other-filter-org",
    });

    const createInvite = async (organizationId: string) => {
      const response = await client.organizations[":id"].invitations.$post(
        {
          param: { id: organizationId },
          json: invitePayload,
          header: { "tenant-id": tenantId },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );
      expect(response.status).toBe(201);
      return (await response.json()) as { id: string };
    };

    const invite = await createInvite(organization.id);
    const otherInvite = await createInvite(otherOrganization.id);

    const listResponse = await client.organizations[":id"].invitations.$get(
      {
        param: { id: organization.id },
        query: { include_totals: "true" },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(listResponse.status).toBe(200);
    const body = (await listResponse.json()) as {
      invitations: Array<{ id: string }>;
      start: number;
      limit: number;
      length: number;
    };
    expect(body).toMatchObject({ start: 0, limit: 50, length: 1 });
    expect(body.invitations.map((i) => i.id)).toEqual([invite.id]);

    // Another organization's invitation must not be readable or deletable
    // through this organization.
    const crossOrgGet = await client.organizations[":id"].invitations[
      ":invitation_id"
    ].$get(
      {
        param: { id: organization.id, invitation_id: otherInvite.id },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(crossOrgGet.status).toBe(404);

    const crossOrgDelete = await client.organizations[":id"].invitations[
      ":invitation_id"
    ].$delete(
      {
        param: { id: organization.id, invitation_id: otherInvite.id },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(crossOrgDelete.status).toBe(404);
  });

  it("returns 404 on every route for an unknown organization", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const listResponse = await client.organizations[":id"].invitations.$get(
      {
        param: { id: "org_does_not_exist" },
        query: {},
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(listResponse.status).toBe(404);

    const createResponse = await client.organizations[":id"].invitations.$post(
      {
        param: { id: "org_does_not_exist" },
        json: invitePayload,
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(createResponse.status).toBe(404);

    const getResponse = await client.organizations[":id"].invitations[
      ":invitation_id"
    ].$get(
      {
        param: { id: "org_does_not_exist", invitation_id: "inv_1" },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(getResponse.status).toBe(404);

    const deleteResponse = await client.organizations[":id"].invitations[
      ":invitation_id"
    ].$delete(
      {
        param: { id: "org_does_not_exist", invitation_id: "inv_1" },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(deleteResponse.status).toBe(404);
  });

  it("does not leak invitations across tenants", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const ownerTenant = `org-inv-owner-${Date.now()}`;
    const otherTenant = `org-inv-other-${Date.now()}`;
    await seedTenant(env, ownerTenant);
    await seedTenant(env, otherTenant);

    // Both tenants hold an organization with the same name.
    const ownerOrg = await env.data.organizations.create(ownerTenant, {
      name: "shared-org",
    });
    const otherOrg = await env.data.organizations.create(otherTenant, {
      name: "shared-org",
    });
    expect(ownerOrg.id).not.toBe(otherOrg.id);

    const createResponse = await client.organizations[":id"].invitations.$post(
      {
        param: { id: ownerOrg.id },
        json: invitePayload,
        header: { "tenant-id": ownerTenant },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    // Without this the isolation assertions below would also pass if the
    // invitation had never been created.
    expect(createResponse.status).toBe(201);
    const invite = (await createResponse.json()) as { id: string };

    const otherList = await client.organizations[":id"].invitations.$get(
      {
        param: { id: otherOrg.id },
        query: {},
        header: { "tenant-id": otherTenant },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(otherList.status).toBe(200);
    expect(await otherList.json()).toEqual([]);

    const otherGet = await client.organizations[":id"].invitations[
      ":invitation_id"
    ].$get(
      {
        param: { id: otherOrg.id, invitation_id: invite.id },
        header: { "tenant-id": otherTenant },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(otherGet.status).toBe(404);
  });
});

describe("organization enabled connections", () => {
  async function seedConnection(
    env: Bindings,
    tenantId: string,
    connectionId: string,
  ) {
    return env.data.connections.create(tenantId, {
      id: connectionId,
      name: connectionId,
      strategy: "auth2",
      options: {},
    });
  }

  it("enables, lists, reads, updates and disables a connection", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `org-connections-${Date.now()}`;
    await seedTenant(env, tenantId);
    await seedConnection(env, tenantId, "org-connection");
    const organization = await env.data.organizations.create(tenantId, {
      name: "connections-org",
    });

    const createResponse = await client.organizations[
      ":id"
    ].enabled_connections.$post(
      {
        param: { id: organization.id },
        json: { connection_id: "org-connection", show_as_button: false },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(createResponse.status).toBe(201);
    expect(await createResponse.json()).toMatchObject({
      connection_id: "org-connection",
      show_as_button: false,
    });

    // Auth0's SDK always decodes the `connections` wrapper, so this endpoint
    // returns it regardless of include_totals.
    const listResponse = await client.organizations[
      ":id"
    ].enabled_connections.$get(
      {
        param: { id: organization.id },
        query: {},
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(listResponse.status).toBe(200);
    const list = (await listResponse.json()) as {
      connections: Array<{ connection_id: string }>;
      total: number;
      start: number;
      limit: number;
      length: number;
    };
    expect(list).toMatchObject({ total: 1, start: 0, limit: 50, length: 1 });
    expect(list.connections.map((c) => c.connection_id)).toEqual([
      "org-connection",
    ]);

    const getResponse = await client.organizations[":id"].enabled_connections[
      ":connection_id"
    ].$get(
      {
        param: { id: organization.id, connection_id: "org-connection" },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(getResponse.status).toBe(200);

    const patchResponse = await client.organizations[":id"].enabled_connections[
      ":connection_id"
    ].$patch(
      {
        param: { id: organization.id, connection_id: "org-connection" },
        json: { assign_membership_on_login: true },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(patchResponse.status).toBe(200);
    expect(await patchResponse.json()).toMatchObject({
      assign_membership_on_login: true,
    });

    const deleteResponse = await client.organizations[
      ":id"
    ].enabled_connections[":connection_id"].$delete(
      {
        param: { id: organization.id, connection_id: "org-connection" },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(deleteResponse.status).toBe(204);

    const afterResponse = await client.organizations[
      ":id"
    ].enabled_connections.$get(
      {
        param: { id: organization.id },
        query: {},
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(
      ((await afterResponse.json()) as { connections: unknown[] }).connections,
    ).toEqual([]);
  });

  it("rejects an unknown connection with a 400 and a duplicate with a 409", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `org-connections-conflict-${Date.now()}`;
    await seedTenant(env, tenantId);
    await seedConnection(env, tenantId, "dup-connection");
    const organization = await env.data.organizations.create(tenantId, {
      name: "conflict-org",
    });

    const unknownConnection = await client.organizations[
      ":id"
    ].enabled_connections.$post(
      {
        param: { id: organization.id },
        json: { connection_id: "no-such-connection" },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(unknownConnection.status).toBe(400);

    const enable = () =>
      client.organizations[":id"].enabled_connections.$post(
        {
          param: { id: organization.id },
          json: { connection_id: "dup-connection" },
          header: { "tenant-id": tenantId },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

    expect((await enable()).status).toBe(201);
    expect((await enable()).status).toBe(409);
  });

  it("returns 404 for an unknown organization or connection", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `org-connections-404-${Date.now()}`;
    await seedTenant(env, tenantId);
    const organization = await env.data.organizations.create(tenantId, {
      name: "connections-404-org",
    });

    const unknownOrgList = await client.organizations[
      ":id"
    ].enabled_connections.$get(
      {
        param: { id: "org_does_not_exist" },
        query: {},
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(unknownOrgList.status).toBe(404);

    const unknownOrgCreate = await client.organizations[
      ":id"
    ].enabled_connections.$post(
      {
        param: { id: "org_does_not_exist" },
        json: { connection_id: "org-connection" },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(unknownOrgCreate.status).toBe(404);

    const unknownConnectionGet = await client.organizations[
      ":id"
    ].enabled_connections[":connection_id"].$get(
      {
        param: { id: organization.id, connection_id: "not-enabled" },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(unknownConnectionGet.status).toBe(404);

    const unknownConnectionPatch = await client.organizations[
      ":id"
    ].enabled_connections[":connection_id"].$patch(
      {
        param: { id: organization.id, connection_id: "not-enabled" },
        json: { show_as_button: false },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(unknownConnectionPatch.status).toBe(404);

    const unknownConnectionDelete = await client.organizations[
      ":id"
    ].enabled_connections[":connection_id"].$delete(
      {
        param: { id: organization.id, connection_id: "not-enabled" },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(unknownConnectionDelete.status).toBe(404);
  });
});
