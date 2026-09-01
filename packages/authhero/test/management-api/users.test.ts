import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../helpers/token";
import { getTestServer } from "../helpers/test-server";
import type { Bindings } from "../../src/types";

// The user sub-resources — global roles, organization memberships and
// sessions — had no coverage at all, and neither did the plain 404 paths on
// GET/DELETE /users/{user_id}. See the "Management API CRUD tests are thin"
// box in #1015.

async function seedTenant(env: Bindings, tenantId: string) {
  await env.data.tenants.create({
    id: tenantId,
    friendly_name: "Users Tenant",
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

describe("POST /api/v2/users", () => {
  it("returns 400 rather than 500 when the request has no body or content-type", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();

    // A bodyless POST used to bypass the zod validator entirely (the body was
    // not marked `required`), so the handler ran with `{}` and only failed at
    // the database layer, surfacing as a generic 500.
    const response = await managementApp.request(
      "/users",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
        },
      },
      env,
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when a required field is missing from the body", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();

    const response = await managementApp.request(
      "/users",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
          "content-type": "application/json",
        },
        // `connection` is required by userInsertSchema.
        body: JSON.stringify({ email: "no-connection@example.com" }),
      },
      env,
    );

    expect(response.status).toBe(400);
  });

  it("still creates a user when given a valid body", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();

    const response = await managementApp.request(
      "/users",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "valid-body@example.com",
          connection: "Username-Password-Authentication",
        }),
      },
      env,
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ email: "valid-body@example.com" });
  });

  // Management create deliberately 409s where the login flow resolves to the
  // existing user: creating a user here is an explicit administrative act,
  // often scripted in bulk, so silently returning a user_id the caller did not
  // create would hide a merge. Decision recorded in #1166.
  it("rejects creating a second sms user with an existing sms phone number", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();

    await env.data.users.create("tenantId", {
      user_id: "sms|existing",
      phone_number: "+46700000010",
      email_verified: false,
      provider: "sms",
      connection: "sms",
      is_social: false,
    });

    const response = await managementApp.request(
      "/users",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          phone_number: "+46700000010",
          connection: "sms",
        }),
      },
      env,
    );

    expect(response.status).toBe(409);
  });

  it("allows creating a non-sms user carrying a phone number an sms user holds", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();

    await env.data.users.create("tenantId", {
      user_id: "sms|holder",
      phone_number: "+46700000011",
      email_verified: false,
      provider: "sms",
      connection: "sms",
      is_social: false,
    });

    const response = await managementApp.request(
      "/users",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "carries-phone@example.com",
          phone_number: "+46700000011",
          connection: "Username-Password-Authentication",
        }),
      },
      env,
    );

    expect(response.status).toBe(201);
  });
});

describe("PATCH /api/v2/users/:user_id phone_number uniqueness", () => {
  const PHONE = "+46700000001";

  async function patchPhone(
    managementApp: Awaited<ReturnType<typeof getTestServer>>["managementApp"],
    env: Awaited<ReturnType<typeof getTestServer>>["env"],
    userId: string,
    phone_number: string,
  ) {
    const token = await getAdminToken();
    return managementApp.request(
      `/users/${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
          "content-type": "application/json",
        },
        body: JSON.stringify({ phone_number }),
      },
      env,
    );
  }

  it("allows a non-sms user to take a phone number another non-sms user already has", async () => {
    const { managementApp, env } = await getTestServer();

    // Placeholder/dummy numbers on email-provider users are ordinary profile
    // data, not identities — production carries thousands of them (#1166).
    // The old unscoped check 409'd on these, blocking legitimate updates.
    await env.data.users.create("tenantId", {
      user_id: "auth2|other-email-user",
      email: "other@example.com",
      email_verified: true,
      phone_number: PHONE,
      provider: "auth2",
      connection: "Username-Password-Authentication",
      is_social: false,
    });
    await env.data.users.create("tenantId", {
      user_id: "auth2|target-email-user",
      email: "target@example.com",
      email_verified: true,
      provider: "auth2",
      connection: "Username-Password-Authentication",
      is_social: false,
    });

    const response = await patchPhone(
      managementApp,
      env,
      "auth2|target-email-user",
      PHONE,
    );

    expect(response.status).toBe(200);
  });

  it("allows a non-sms user to take a phone number an sms user identifies by", async () => {
    const { managementApp, env } = await getTestServer();

    await env.data.users.create("tenantId", {
      user_id: "sms|sms-user",
      phone_number: PHONE,
      email_verified: false,
      provider: "sms",
      connection: "sms",
      is_social: false,
    });
    await env.data.users.create("tenantId", {
      user_id: "auth2|profile-user",
      email: "profile@example.com",
      email_verified: true,
      provider: "auth2",
      connection: "Username-Password-Authentication",
      is_social: false,
    });

    // The sms user's phone is their identity, but that does not stop an
    // unrelated user recording the same number as profile data.
    const response = await patchPhone(
      managementApp,
      env,
      "auth2|profile-user",
      PHONE,
    );

    expect(response.status).toBe(200);
  });

  it("still rejects an sms user taking a phone number another sms user identifies by", async () => {
    const { managementApp, env } = await getTestServer();

    await env.data.users.create("tenantId", {
      user_id: "sms|incumbent",
      phone_number: PHONE,
      email_verified: false,
      provider: "sms",
      connection: "sms",
      is_social: false,
    });
    await env.data.users.create("tenantId", {
      user_id: "sms|challenger",
      phone_number: "+46700000002",
      email_verified: false,
      provider: "sms",
      connection: "sms",
      is_social: false,
    });

    const response = await patchPhone(
      managementApp,
      env,
      "sms|challenger",
      PHONE,
    );

    expect(response.status).toBe(409);
  });

  it("lets an sms user keep a phone number that only they hold", async () => {
    const { managementApp, env } = await getTestServer();

    await env.data.users.create("tenantId", {
      user_id: "sms|sole-holder",
      phone_number: "+46700000003",
      email_verified: false,
      provider: "sms",
      connection: "sms",
      is_social: false,
    });

    const response = await patchPhone(
      managementApp,
      env,
      "sms|sole-holder",
      PHONE,
    );

    expect(response.status).toBe(200);
  });
});

describe("GET/DELETE /api/v2/users/:user_id", () => {
  it("returns 404 when fetching a user that does not exist", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const response = await client.users[":user_id"].$get(
      {
        param: { user_id: "email|nobody" },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when deleting a user that does not exist", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const response = await client.users[":user_id"].$delete(
      {
        param: { user_id: "email|nobody" },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(404);
  });

  it("does not reach a user belonging to another tenant", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `users-isolation-${Date.now()}`;
    await seedTenant(env, tenantId);
    await seedUser(env, tenantId, "email|other-tenant-user");

    const response = await client.users[":user_id"].$get(
      {
        param: { user_id: "email|other-tenant-user" },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(404);
  });
});

describe("user roles", () => {
  it("assigns, lists and removes global roles", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `user-roles-${Date.now()}`;
    await seedTenant(env, tenantId);
    await seedUser(env, tenantId, "email|role-user");
    const role = await env.data.roles.create(tenantId, {
      name: "tenant-admin",
      description: "Tenant administrator",
    });

    const assignResponse = await client.users[":user_id"].roles.$post(
      {
        param: { user_id: "email|role-user" },
        json: { roles: [role.id] },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(assignResponse.status).toBe(201);

    const listResponse = await client.users[":user_id"].roles.$get(
      {
        param: { user_id: "email|role-user" },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(listResponse.status).toBe(200);
    const roles = (await listResponse.json()) as Array<{ id: string }>;
    expect(roles.map((r) => r.id)).toEqual([role.id]);

    const removeResponse = await client.users[":user_id"].roles.$delete(
      {
        param: { user_id: "email|role-user" },
        json: { roles: [role.id] },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(removeResponse.status).toBe(200);

    const afterResponse = await client.users[":user_id"].roles.$get(
      {
        param: { user_id: "email|role-user" },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(await afterResponse.json()).toEqual([]);
  });

  it("returns 404 for a user that does not exist", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const listResponse = await client.users[":user_id"].roles.$get(
      {
        param: { user_id: "email|nobody" },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(listResponse.status).toBe(404);

    const assignResponse = await client.users[":user_id"].roles.$post(
      {
        param: { user_id: "email|nobody" },
        json: { roles: [] },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(assignResponse.status).toBe(404);

    const removeResponse = await client.users[":user_id"].roles.$delete(
      {
        param: { user_id: "email|nobody" },
        json: { roles: [] },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(removeResponse.status).toBe(404);
  });
});

describe("user organizations", () => {
  it("lists the organizations a user belongs to and removes a membership", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `user-orgs-${Date.now()}`;
    await seedTenant(env, tenantId);
    await seedUser(env, tenantId, "email|org-member");
    const organization = await env.data.organizations.create(tenantId, {
      name: "acme",
      display_name: "Acme Inc",
    });
    await env.data.userOrganizations.create(tenantId, {
      user_id: "email|org-member",
      organization_id: organization.id,
    });

    const listResponse = await client.users[":user_id"].organizations.$get(
      {
        param: { user_id: "email|org-member" },
        query: {},
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(listResponse.status).toBe(200);
    const organizations = (await listResponse.json()) as Array<{ id: string }>;
    expect(organizations.map((o) => o.id)).toEqual([organization.id]);

    const removeResponse = await client.users[":user_id"].organizations[
      ":organization_id"
    ].$delete(
      {
        param: {
          user_id: "email|org-member",
          organization_id: organization.id,
        },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(removeResponse.status).toBe(200);

    const afterResponse = await client.users[":user_id"].organizations.$get(
      {
        param: { user_id: "email|org-member" },
        query: {},
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(await afterResponse.json()).toEqual([]);
  });

  it("returns the totals envelope when include_totals is set", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `user-orgs-totals-${Date.now()}`;
    await seedTenant(env, tenantId);
    await seedUser(env, tenantId, "email|org-totals");
    const organization = await env.data.organizations.create(tenantId, {
      name: "totals-org",
    });
    await env.data.userOrganizations.create(tenantId, {
      user_id: "email|org-totals",
      organization_id: organization.id,
    });

    const response = await client.users[":user_id"].organizations.$get(
      {
        param: { user_id: "email|org-totals" },
        query: { include_totals: "true", page: "0", per_page: "10" },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ start: 0, limit: 10, length: 1 });
    expect((body as { organizations: unknown[] }).organizations).toHaveLength(
      1,
    );
  });

  it("returns 404 for an unknown user and for a membership the user does not have", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tenantId = `user-orgs-404-${Date.now()}`;
    await seedTenant(env, tenantId);
    await seedUser(env, tenantId, "email|no-orgs");
    const organization = await env.data.organizations.create(tenantId, {
      name: "unrelated-org",
    });

    const unknownUser = await client.users[":user_id"].organizations.$get(
      {
        param: { user_id: "email|nobody" },
        query: {},
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(unknownUser.status).toBe(404);

    const notAMember = await client.users[":user_id"].organizations[
      ":organization_id"
    ].$delete(
      {
        param: { user_id: "email|no-orgs", organization_id: organization.id },
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(notAMember.status).toBe(404);
  });
});

describe("GET /api/v2/users/:user_id/sessions", () => {
  async function createSession(env: Bindings, userId: string, id: string) {
    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      csrf_token: "csrf",
      authParams: { client_id: "clientId" },
    });
    const expiresAt = new Date(Date.now() + 3600_000).toISOString();

    return env.data.sessions.create("tenantId", {
      id,
      user_id: userId,
      login_session_id: loginSession.id,
      used_at: new Date().toISOString(),
      device: {},
      clients: ["clientId"],
      expires_at: expiresAt,
      idle_expires_at: expiresAt,
    });
  }

  it("returns only the sessions belonging to the user", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    await seedUser(env, "tenantId", "email|session-owner");
    await seedUser(env, "tenantId", "email|session-stranger");
    await createSession(env, "email|session-owner", "session-owned");
    await createSession(env, "email|session-stranger", "session-other");

    const response = await client.users[":user_id"].sessions.$get(
      {
        param: { user_id: "email|session-owner" },
        query: {},
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    const sessions = (await response.json()) as Array<{ id: string }>;
    expect(sessions.map((s) => s.id)).toEqual(["session-owned"]);
  });

  it("returns the totals envelope when include_totals is set", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    await seedUser(env, "tenantId", "email|session-totals");
    await createSession(env, "email|session-totals", "session-totals-1");

    const response = await client.users[":user_id"].sessions.$get(
      {
        param: { user_id: "email|session-totals" },
        query: { include_totals: "true", page: "0", per_page: "10" },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ start: 0, limit: 10 });
    expect((body as { sessions: unknown[] }).sessions).toHaveLength(1);
  });

  it("returns an empty list for a user with no sessions", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const response = await client.users[":user_id"].sessions.$get(
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
