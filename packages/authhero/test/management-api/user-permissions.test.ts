import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../helpers/token";
import { getTestServer } from "../helpers/test-server";
import type { Bindings } from "../../src/types";

// The user permission endpoints and the connected-clients listing had no
// coverage at all. See the "Management API CRUD tests are thin" box in #1015.

async function seedTenant(env: Bindings, tenantId: string) {
  await env.data.tenants.create({
    id: tenantId,
    friendly_name: "Permissions Tenant",
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

describe("user permissions", () => {
  it("assigns, lists and removes permissions", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `user-permissions-${Date.now()}`;
    await seedTenant(env, tenantId);
    await seedUser(env, tenantId, "email|permission-user");
    await env.data.resourceServers.create(tenantId, {
      name: "Permissions API",
      identifier: "https://permissions.example.com",
      scopes: [{ value: "read:things", description: "Read things" }],
    });

    const assignResponse = await client.users[":user_id"].permissions.$post(
      {
        param: { user_id: "email|permission-user" },
        json: {
          permissions: [
            {
              permission_name: "read:things",
              resource_server_identifier: "https://permissions.example.com",
            },
          ],
        },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(assignResponse.status).toBe(201);

    const listResponse = await client.users[":user_id"].permissions.$get(
      {
        param: { user_id: "email|permission-user" },
        query: {},
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(listResponse.status).toBe(200);
    const permissions = await listResponse.json();
    expect(permissions).toHaveLength(1);
    expect(permissions[0]).toMatchObject({
      user_id: "email|permission-user",
      permission_name: "read:things",
      resource_server_identifier: "https://permissions.example.com",
    });
    // A permission assigned outside an organization is reported without one,
    // not with the empty string the adapters store internally.
    expect(permissions[0].organization_id).toBeUndefined();
    // Documents current behaviour, not desired behaviour: the kysely
    // user-permissions list joins `resource_servers.id` against the stored
    // `resource_server_identifier` (an audience URI), so the join never
    // matches and the name always falls back to the identifier. The drizzle
    // adapter joins on `resource_servers.identifier` and does resolve the
    // name. Flagged for a human on the PR — if the kysely join is fixed, this
    // assertion should become `"Permissions API"`.
    expect(permissions[0].resource_server_name).toBe(
      "https://permissions.example.com",
    );

    const removeResponse = await client.users[":user_id"].permissions.$delete(
      {
        param: { user_id: "email|permission-user" },
        json: {
          permissions: [
            {
              permission_name: "read:things",
              resource_server_identifier: "https://permissions.example.com",
            },
          ],
        },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(removeResponse.status).toBe(200);

    const afterResponse = await client.users[":user_id"].permissions.$get(
      {
        param: { user_id: "email|permission-user" },
        query: {},
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(await afterResponse.json()).toEqual([]);
  });

  it("assigning the same permission twice is idempotent", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `user-permissions-dup-${Date.now()}`;
    await seedTenant(env, tenantId);
    await seedUser(env, tenantId, "email|dup-user");

    const assign = () =>
      client.users[":user_id"].permissions.$post(
        {
          param: { user_id: "email|dup-user" },
          json: {
            permissions: [
              {
                permission_name: "read:things",
                resource_server_identifier: "https://permissions.example.com",
              },
            ],
          },
          header: { "tenant-id": tenantId },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

    expect((await assign()).status).toBe(201);
    // The adapters swallow the duplicate-key error rather than 500ing, so a
    // replayed assignment must stay a no-op instead of doubling the row.
    expect((await assign()).status).toBe(201);

    const listResponse = await client.users[":user_id"].permissions.$get(
      {
        param: { user_id: "email|dup-user" },
        query: {},
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(await listResponse.json()).toHaveLength(1);
  });

  it("does not return permissions assigned in another tenant", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const ownerTenant = `user-permissions-owner-${Date.now()}`;
    const otherTenant = `user-permissions-other-${Date.now()}`;
    await seedTenant(env, ownerTenant);
    await seedTenant(env, otherTenant);
    // The same user_id exists in both tenants, so only the tenant scoping of
    // the query can keep the two assignments apart.
    await seedUser(env, ownerTenant, "email|shared-id");
    await seedUser(env, otherTenant, "email|shared-id");

    await client.users[":user_id"].permissions.$post(
      {
        param: { user_id: "email|shared-id" },
        json: {
          permissions: [
            {
              permission_name: "read:things",
              resource_server_identifier: "https://permissions.example.com",
            },
          ],
        },
        header: { "tenant-id": ownerTenant },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    const response = await client.users[":user_id"].permissions.$get(
      {
        param: { user_id: "email|shared-id" },
        query: {},
        header: { "tenant-id": otherTenant },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("returns 404 for a user that does not exist", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const listResponse = await client.users[":user_id"].permissions.$get(
      {
        param: { user_id: "email|nobody" },
        query: {},
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(listResponse.status).toBe(404);

    const assignResponse = await client.users[":user_id"].permissions.$post(
      {
        param: { user_id: "email|nobody" },
        json: { permissions: [] },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(assignResponse.status).toBe(404);

    const removeResponse = await client.users[":user_id"].permissions.$delete(
      {
        param: { user_id: "email|nobody" },
        json: { permissions: [] },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(removeResponse.status).toBe(404);
  });
});

describe("GET /api/v2/users/:user_id/connected-clients", () => {
  async function seedClient(
    env: Bindings,
    tenantId: string,
    clientId: string,
    overrides: Partial<Parameters<typeof env.data.clients.create>[1]> = {},
  ) {
    return env.data.clients.create(tenantId, {
      client_id: clientId,
      client_secret: `${clientId}-secret`,
      name: clientId,
      callbacks: [],
      allowed_logout_urls: [],
      web_origins: [],
      ...overrides,
    });
  }

  it("returns only the clients the user owns, without their secrets", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `connected-clients-${Date.now()}`;
    await seedTenant(env, tenantId);
    await seedUser(env, tenantId, "email|app-owner");
    await seedClient(env, tenantId, "owned-app", {
      owner_user_id: "email|app-owner",
      registration_type: "iat_dcr",
    });
    await seedClient(env, tenantId, "someone-elses-app", {
      owner_user_id: "email|other-owner",
    });
    await seedClient(env, tenantId, "manually-created-app");

    const response = await client.users[":user_id"]["connected-clients"].$get(
      {
        param: { user_id: "email|app-owner" },
        query: {},
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    const clients = await response.json();
    expect(clients).toHaveLength(1);
    expect(clients[0]).toMatchObject({
      client_id: "owned-app",
      registration_type: "iat_dcr",
    });
    // The endpoint feeds an end-user "connected apps" screen, so it projects
    // to a slim shape rather than returning the full client record.
    expect(clients[0]).not.toHaveProperty("client_secret");
  });

  it("omits clients that have been soft-deleted", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `connected-clients-deleted-${Date.now()}`;
    await seedTenant(env, tenantId);
    await seedUser(env, tenantId, "email|revoker");
    await seedClient(env, tenantId, "revoked-app", {
      owner_user_id: "email|revoker",
      client_metadata: { status: "deleted" },
    });

    const response = await client.users[":user_id"]["connected-clients"].$get(
      {
        param: { user_id: "email|revoker" },
        query: {},
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("returns the totals envelope when include_totals is set", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `connected-clients-totals-${Date.now()}`;
    await seedTenant(env, tenantId);
    await seedUser(env, tenantId, "email|totals-owner");
    await seedClient(env, tenantId, "totals-app", {
      owner_user_id: "email|totals-owner",
    });

    const response = await client.users[":user_id"]["connected-clients"].$get(
      {
        param: { user_id: "email|totals-owner" },
        query: { include_totals: "true", page: "0", per_page: "10" },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ start: 0, limit: 10, length: 1 });
    expect(
      (body as { connected_clients: unknown[] }).connected_clients,
    ).toHaveLength(1);
  });

  it("returns an empty list for a user that owns no clients", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const response = await client.users[":user_id"]["connected-clients"].$get(
      {
        param: { user_id: "email|userId" },
        query: {},
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});
