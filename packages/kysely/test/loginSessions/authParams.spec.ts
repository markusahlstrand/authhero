import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";
import {
  AuthorizationResponseType,
  LoginSessionState,
} from "@authhero/adapter-interfaces";

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
  it("dual-writes the auth_params JSON blob and the hoisted columns on create, round-trips on get", async () => {
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

    // Sanity: both the blob and the hoisted columns are populated.
    const row = await db
      .selectFrom("login_sessions")
      .selectAll()
      .where("id", "=", created.id)
      .executeTakeFirstOrThrow();
    expect(typeof (row as { auth_params?: string }).auth_params).toBe("string");
    const blob = JSON.parse(
      (row as { auth_params: string }).auth_params,
    );
    expect(blob).toMatchObject({
      client_id: "client123",
      scope: "openid profile email",
      username: "foo@example.com",
      ui_locales: "en",
    });
    expect((row as Record<string, unknown>).authParams_client_id).toBe(
      "client123",
    );
    expect((row as Record<string, unknown>).authParams_username).toBe(
      "foo@example.com",
    );
    expect((row as Record<string, unknown>).authParams_ui_locales).toBe("en");

    // Read path: the blob is the source of truth.
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

  it("falls back to hoisted columns when auth_params is NULL (pre-backfill row)", async () => {
    const { data, db } = await getTestServer();
    await seedTenantAndClient(data);

    const now = Date.now();
    await db
      .insertInto("login_sessions")
      .values({
        id: "legacy-row-1",
        tenant_id: "tenantId",
        csrf_token: "csrf",
        authParams_client_id: "client123",
        authParams_response_type: "code",
        authParams_scope: "openid profile",
        authParams_state: "legacy-state",
        authParams_username: "legacy@example.com",
        authParams_ui_locales: "nb",
        auth_params: null,
        state: LoginSessionState.PENDING,
        created_at_ts: now,
        updated_at_ts: now,
        expires_at_ts: now + 1000 * 60 * 60,
      } as any)
      .execute();

    const fetched = await data.loginSessions.get("tenantId", "legacy-row-1");
    expect(fetched?.authParams).toMatchObject({
      client_id: "client123",
      response_type: "code",
      scope: "openid profile",
      state: "legacy-state",
      username: "legacy@example.com",
      ui_locales: "nb",
    });
  });

  it("update({ authParams: { username } }) merges into the blob and the hoisted column", async () => {
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
    expect((row as Record<string, unknown>).authParams_username).toBe(
      "new@example.com",
    );

    const fetched = await data.loginSessions.get("tenantId", created.id);
    expect(fetched?.authParams.username).toBe("new@example.com");
    expect(fetched?.authParams.scope).toBe("openid profile");
  });

  it("update with full authParams object merges all fields into blob + hoisted columns", async () => {
    // This is the pattern used by many callers (identifier, login, screen-api):
    // mutate loginSession.authParams in-memory and pass the whole session back.
    // The adapter must accept the full object and keep both storage paths in
    // sync without rejecting unchanged immutable fields.
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
    expect((row as Record<string, unknown>).authParams_username).toBe(
      "entered@example.com",
    );
    expect((row as Record<string, unknown>).authParams_ui_locales).toBe("nb");
  });
});
