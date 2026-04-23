import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";
import {
  AuthorizationResponseType,
  LoginSessionState,
} from "@authhero/adapter-interfaces";

async function seedTenantAndClient(data: any) {
  await data.tenants.create({
    id: "tenantId",
    friendly_name: "Test Tenant",
    audience: "https://example.com",
    sender_email: "login@example.com",
    sender_name: "SenderName",
  });

  await data.clients.create("tenantId", {
    client_id: "clientId",
    client_secret: "clientSecret",
    name: "Test Client",
    callbacks: ["https://example.com/callback"],
    allowed_logout_urls: ["https://example.com/callback"],
    web_origins: ["https://example.com"],
    client_metadata: {},
  });
}

async function createLoginSession(data: any, expiresAt: string) {
  return data.loginSessions.create("tenantId", {
    csrf_token: "csrf",
    authParams: {
      client_id: "clientId",
      response_type: AuthorizationResponseType.CODE,
      scope: "openid offline_access",
    },
    expires_at: expiresAt,
    state: LoginSessionState.PENDING,
  });
}

function device() {
  return {
    last_ip: "",
    initial_ip: "",
    last_user_agent: "",
    initial_user_agent: "",
    initial_asn: "",
    last_asn: "",
  };
}

describe("refreshTokens adapter keeps parent login_session alive", () => {
  it("extends login_session.expires_at to match the refresh token's longest expiry on create", async () => {
    const { data } = await getTestServer();
    await seedTenantAndClient(data);

    const shortExpiry = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1h
    const longExpiry = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 7,
    ).toISOString(); // 7d
    const idleExpiry = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 3,
    ).toISOString(); // 3d

    const loginSession = await createLoginSession(data, shortExpiry);

    await data.refreshTokens.create("tenantId", {
      id: "rt1",
      login_id: loginSession.id,
      user_id: "email|userId",
      client_id: "clientId",
      expires_at: longExpiry,
      idle_expires_at: idleExpiry,
      resource_servers: [{ audience: "http://example.com", scopes: "openid" }],
      device: device(),
      rotating: false,
    });

    const after = await data.loginSessions.get("tenantId", loginSession.id);
    // Bumped to max(expires_at, idle_expires_at) = longExpiry
    expect(after?.expires_at).toEqual(longExpiry);
  });

  it("never shortens an already-longer login_session on create", async () => {
    const { data } = await getTestServer();
    await seedTenantAndClient(data);

    const longExpiry = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 30,
    ).toISOString(); // 30d
    const shortExpiry = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1h

    const loginSession = await createLoginSession(data, longExpiry);

    await data.refreshTokens.create("tenantId", {
      id: "rt1",
      login_id: loginSession.id,
      user_id: "email|userId",
      client_id: "clientId",
      expires_at: shortExpiry,
      resource_servers: [{ audience: "http://example.com", scopes: "openid" }],
      device: device(),
      rotating: false,
    });

    const after = await data.loginSessions.get("tenantId", loginSession.id);
    expect(after?.expires_at).toEqual(longExpiry);
  });

  it("extends login_session.expires_at on update when idle_expires_at is bumped", async () => {
    const { data } = await getTestServer();
    await seedTenantAndClient(data);

    const initialExpiry = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1h
    const rtExpiry = new Date(
      Date.now() + 1000 * 60 * 60 * 24,
    ).toISOString(); // 1d
    const bumpedIdleExpiry = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 5,
    ).toISOString(); // 5d

    const loginSession = await createLoginSession(data, initialExpiry);

    await data.refreshTokens.create("tenantId", {
      id: "rt1",
      login_id: loginSession.id,
      user_id: "email|userId",
      client_id: "clientId",
      expires_at: rtExpiry,
      idle_expires_at: rtExpiry,
      resource_servers: [{ audience: "http://example.com", scopes: "openid" }],
      device: device(),
      rotating: false,
    });

    await data.refreshTokens.update(
      "tenantId",
      "rt1",
      {
        idle_expires_at: bumpedIdleExpiry,
        last_exchanged_at: new Date().toISOString(),
      },
      {
        loginSessionBump: {
          login_id: loginSession.id,
          expires_at: bumpedIdleExpiry,
        },
      },
    );

    const after = await data.loginSessions.get("tenantId", loginSession.id);
    expect(after?.expires_at).toEqual(bumpedIdleExpiry);
  });

  it("does not extend login_session when caller omits loginSessionBump", async () => {
    const { data } = await getTestServer();
    await seedTenantAndClient(data);

    const initialExpiry = new Date(Date.now() + 1000 * 60 * 60).toISOString();
    const bumpedIdleExpiry = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 5,
    ).toISOString();

    const loginSession = await createLoginSession(data, initialExpiry);

    await data.refreshTokens.create("tenantId", {
      id: "rt1",
      login_id: loginSession.id,
      user_id: "email|userId",
      client_id: "clientId",
      expires_at: initialExpiry,
      idle_expires_at: initialExpiry,
      resource_servers: [{ audience: "http://example.com", scopes: "openid" }],
      device: device(),
      rotating: false,
    });

    // Caller chose not to bump — adapter must leave login_session alone even
    // though the refresh token's idle_expires_at moved forward.
    await data.refreshTokens.update("tenantId", "rt1", {
      idle_expires_at: bumpedIdleExpiry,
    });

    const after = await data.loginSessions.get("tenantId", loginSession.id);
    expect(after?.expires_at).toEqual(initialExpiry);
  });

  it("does not touch login_session on updates that don't change expiry", async () => {
    const { data } = await getTestServer();
    await seedTenantAndClient(data);

    const rtExpiry = new Date(
      Date.now() + 1000 * 60 * 60 * 24,
    ).toISOString();

    const loginSession = await createLoginSession(data, rtExpiry);

    await data.refreshTokens.create("tenantId", {
      id: "rt1",
      login_id: loginSession.id,
      user_id: "email|userId",
      client_id: "clientId",
      expires_at: rtExpiry,
      idle_expires_at: rtExpiry,
      resource_servers: [{ audience: "http://example.com", scopes: "openid" }],
      device: device(),
      rotating: false,
    });

    const before = await data.loginSessions.get("tenantId", loginSession.id);

    await data.refreshTokens.update("tenantId", "rt1", {
      device: { ...device(), last_ip: "1.2.3.4" },
    });

    const after = await data.loginSessions.get("tenantId", loginSession.id);
    expect(after?.expires_at).toEqual(before?.expires_at);
  });
});
