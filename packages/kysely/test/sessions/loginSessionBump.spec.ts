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

  await data.users.create("tenantId", {
    email: "foo@example.com",
    email_verified: true,
    name: "Test User",
    nickname: "Test User",
    picture: "https://example.com/test.png",
    connection: "email",
    provider: "email",
    is_social: false,
    user_id: "email|userId",
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

describe("sessions adapter keeps parent login_session alive", () => {
  it("extends login_session.expires_at to match the session's longest expiry on create", async () => {
    const { data } = await getTestServer();
    await seedTenantAndClient(data);

    const shortExpiry = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1h
    const absoluteExpiry = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 7,
    ).toISOString(); // 7d
    const idleExpiry = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 3,
    ).toISOString(); // 3d

    const loginSession = await createLoginSession(data, shortExpiry);

    await data.sessions.create("tenantId", {
      id: "session1",
      user_id: "email|userId",
      login_session_id: loginSession.id,
      expires_at: absoluteExpiry,
      idle_expires_at: idleExpiry,
      device: device(),
      clients: ["clientId"],
    });

    const after = await data.loginSessions.get("tenantId", loginSession.id);
    // Bumped to max(expires_at, idle_expires_at) = absoluteExpiry
    expect(after?.expires_at).toEqual(absoluteExpiry);
  });

  it("never shortens an already-longer login_session on create", async () => {
    const { data } = await getTestServer();
    await seedTenantAndClient(data);

    const longExpiry = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 30,
    ).toISOString(); // 30d
    const shortExpiry = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1h

    const loginSession = await createLoginSession(data, longExpiry);

    await data.sessions.create("tenantId", {
      id: "session1",
      user_id: "email|userId",
      login_session_id: loginSession.id,
      expires_at: shortExpiry,
      idle_expires_at: shortExpiry,
      device: device(),
      clients: ["clientId"],
    });

    const after = await data.loginSessions.get("tenantId", loginSession.id);
    expect(after?.expires_at).toEqual(longExpiry);
  });

  it("extends login_session.expires_at when a session is renewed (update)", async () => {
    const { data } = await getTestServer();
    await seedTenantAndClient(data);

    const initialExpiry = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1h
    const renewedExpiry = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 5,
    ).toISOString(); // 5d

    const loginSession = await createLoginSession(data, initialExpiry);

    await data.sessions.create("tenantId", {
      id: "session1",
      user_id: "email|userId",
      login_session_id: loginSession.id,
      expires_at: initialExpiry,
      idle_expires_at: initialExpiry,
      device: device(),
      clients: ["clientId"],
    });

    // Renew the session — slide its idle expiry forward without passing
    // login_session_id, so the adapter must resolve it from the session row.
    await data.sessions.update("tenantId", "session1", {
      idle_expires_at: renewedExpiry,
    });

    const after = await data.loginSessions.get("tenantId", loginSession.id);
    expect(after?.expires_at).toEqual(renewedExpiry);
  });

  it("never shortens the login_session on a session update", async () => {
    const { data } = await getTestServer();
    await seedTenantAndClient(data);

    const longExpiry = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 30,
    ).toISOString(); // 30d
    const shortExpiry = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1h

    const loginSession = await createLoginSession(data, longExpiry);

    await data.sessions.create("tenantId", {
      id: "session1",
      user_id: "email|userId",
      login_session_id: loginSession.id,
      expires_at: shortExpiry,
      idle_expires_at: shortExpiry,
      device: device(),
      clients: ["clientId"],
    });

    await data.sessions.update("tenantId", "session1", {
      idle_expires_at: shortExpiry,
    });

    const after = await data.loginSessions.get("tenantId", loginSession.id);
    expect(after?.expires_at).toEqual(longExpiry);
  });
});
