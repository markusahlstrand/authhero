import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";

async function seedTenantAndClient(data: Awaited<
  ReturnType<typeof getTestServer>
>["data"]) {
  await data.tenants.create({
    id: "tenantId",
    friendly_name: "Test Tenant",
    audience: "https://example.com",
    sender_email: "login@example.com",
    sender_name: "SenderName",
  });
  await data.clients.create("tenantId", {
    client_id: "client123",
    client_secret: "secret123",
    name: "Test Client",
    callbacks: ["https://example.com/callback"],
    allowed_logout_urls: ["https://example.com/callback"],
    web_origins: ["https://example.com"],
    client_metadata: {},
  });
}

describe("loginSessions auth_params blob persistence", () => {
  it("writes auth_params blob on create and round-trips via get", async () => {
    const { data, db } = await getTestServer();
    await seedTenantAndClient(data);

    const created = await data.loginSessions.create("tenantId", {
      csrf_token: "csrf",
      authParams: {
        client_id: "client123",
        response_type: AuthorizationResponseType.CODE,
        scope: "openid profile email",
        state: "state123",
        username: "foo@example.com",
        ui_locales: "en",
      },
      expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    });

    // The blob is the sole source of truth. Hoisted authParams_* columns
    // are removed in 2026-04-21T10:00:00_drop_login_sessions_hoisted_authparams
    // (preceded by 2026-04-20T12:00:00_relax_login_sessions_authparams, which
    // drops the FK and relaxes NOT NULL so this code path works pre-drop).
    const row = await db
      .selectFrom("login_sessions")
      .selectAll()
      .where("id", "=", created.id)
      .executeTakeFirstOrThrow();
    expect(typeof (row as { auth_params?: string }).auth_params).toBe("string");
    const blob = JSON.parse((row as { auth_params: string }).auth_params);
    expect(blob).toMatchObject({
      client_id: "client123",
      scope: "openid profile email",
      username: "foo@example.com",
      ui_locales: "en",
    });

    // Read path: blob is the source of truth.
    const fetched = await data.loginSessions.get("tenantId", created.id);
    expect(fetched?.authParams).toMatchObject({
      client_id: "client123",
      response_type: AuthorizationResponseType.CODE,
      scope: "openid profile email",
      state: "state123",
      username: "foo@example.com",
      ui_locales: "en",
    });
  });

  it("update({ authParams: { username } }) merges into the blob", async () => {
    const { data, db } = await getTestServer();
    await seedTenantAndClient(data);

    const created = await data.loginSessions.create("tenantId", {
      csrf_token: "csrf",
      authParams: {
        client_id: "client123",
        response_type: AuthorizationResponseType.CODE,
        scope: "openid profile",
        state: "state123",
        username: "old@example.com",
      },
      expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    });

    await data.loginSessions.update("tenantId", created.id, {
      authParams: { username: "new@example.com" } as any,
    });

    const row = await db
      .selectFrom("login_sessions")
      .selectAll()
      .where("id", "=", created.id)
      .executeTakeFirstOrThrow();
    const blob = JSON.parse((row as { auth_params: string }).auth_params);
    expect(blob.username).toBe("new@example.com");
    // Other fields preserved on the blob — the update is a merge, not a replace.
    expect(blob.client_id).toBe("client123");
    expect(blob.scope).toBe("openid profile");

    const fetched = await data.loginSessions.get("tenantId", created.id);
    expect(fetched?.authParams.username).toBe("new@example.com");
    expect(fetched?.authParams.scope).toBe("openid profile");
  });

  it("update with full authParams object merges all fields into the blob", async () => {
    // This is the pattern used by many callers (identifier, login, screen-api):
    // mutate loginSession.authParams in-memory and pass the whole session back.
    const { data, db } = await getTestServer();
    await seedTenantAndClient(data);

    const created = await data.loginSessions.create("tenantId", {
      csrf_token: "csrf",
      authParams: {
        client_id: "client123",
        response_type: AuthorizationResponseType.CODE,
        scope: "openid profile",
        state: "state123",
      },
      expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    });

    await data.loginSessions.update("tenantId", created.id, {
      authParams: {
        client_id: "client123",
        response_type: AuthorizationResponseType.CODE,
        scope: "openid profile",
        state: "state123",
        username: "entered@example.com",
        ui_locales: "nb",
      } as any,
    });

    const row = await db
      .selectFrom("login_sessions")
      .selectAll()
      .where("id", "=", created.id)
      .executeTakeFirstOrThrow();
    const blob = JSON.parse((row as { auth_params: string }).auth_params);
    expect(blob).toMatchObject({
      client_id: "client123",
      scope: "openid profile",
      username: "entered@example.com",
      ui_locales: "nb",
    });
  });
});
