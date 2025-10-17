import { describe, expect, it } from "vitest";
import { getTestServer } from "./helpers/test-server";

describe("cleanup", () => {
  it("should remove expired sessions", async () => {
    const fourMonthsAgo = new Date(
      Date.now() - 1000 * 60 * 60 * 24 * 30 * 3,
    ).toISOString();

    const { data, db } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    // Add a client
    await data.clients.create("tenantId", {
      client_id: "clientId",
      client_secret: "clientSecret",
      name: "Test Client",
      callbacks: ["https://example.com/callback"],
      allowed_logout_urls: ["https://example.com/callback"],
      web_origins: ["https://example.com"],
      client_metadata: {
        disable_sign_ups: "false",
      },
    });

    // Add a test user
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

    await data.sessions.create("tenantId", {
      id: "sessionId",
      user_id: "email|userId",
      clients: ["clientId"],
      expires_at: fourMonthsAgo,
      used_at: new Date().toISOString(),
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
    });

    // Create the login session
    await data.loginSessions.create("tenantId", {
      expires_at: fourMonthsAgo,
      csrf_token: "csrfToken",
      session_id: "sessionId",
      authParams: {
        client_id: "clientId",
        username: "foo@exampl.com",
        scope: "",
        audience: "http://example.com",
        redirect_uri: "http://example.com/callback",
      },
    });

    // Create a refresh token
    await data.refreshTokens.create("tenantId", {
      id: "refreshToken",
      session_id: "sessionId",
      user_id: "email|userId",
      client_id: "clientId",
      expires_at: fourMonthsAgo,
      resource_servers: [
        {
          audience: "http://example.com",
          scopes: "openid",
        },
      ],
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
      rotating: false,
    });

    // Do the cleanup
    await data.cleanup();

    // Check that all data is gone
    const loginSessions = await db
      .selectFrom("login_sessions")
      .selectAll()
      .execute();
    expect(loginSessions).toEqual([]);

    const sessions = await db.selectFrom("sessions").selectAll().execute();
    expect(sessions).toEqual([]);

    const refreshTokens = await db
      .selectFrom("refresh_tokens")
      .selectAll()
      .execute();
    expect(refreshTokens).toEqual([]);
  });

  it("should not remove a expired login session that has a non-expired session", async () => {
    const fourMonthsAgo = new Date(
      Date.now() - 1000 * 60 * 60 * 24 * 30 * 3,
    ).toISOString();

    const { data, db } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    // Add a client
    await data.clients.create("tenantId", {
      client_id: "clientId",
      client_secret: "clientSecret",
      name: "Test Client",
      callbacks: ["https://example.com/callback"],
      allowed_logout_urls: ["https://example.com/callback"],
      web_origins: ["https://example.com"],
      client_metadata: {
        disable_sign_ups: "false",
      },
    });

    // Add a test user
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

    await data.sessions.create("tenantId", {
      id: "sessionId",
      user_id: "email|userId",
      clients: ["clientId"],
      expires_at: new Date().toISOString(),
      used_at: new Date().toISOString(),
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
    });

    // Create the login session
    await data.loginSessions.create("tenantId", {
      expires_at: fourMonthsAgo,
      csrf_token: "csrfToken",
      session_id: "sessionId",
      authParams: {
        client_id: "clientId",
        username: "foo@exampl.com",
        scope: "",
        audience: "http://example.com",
        redirect_uri: "http://example.com/callback",
      },
    });

    // Do the cleanup
    await data.cleanup();

    // Check that the login session still is there even though it's expired
    const loginSessions = await db
      .selectFrom("login_sessions")
      .selectAll()
      .execute();
    expect(loginSessions.length).toEqual(1);

    const sessions = await db.selectFrom("sessions").selectAll().execute();
    expect(sessions.length).toEqual(1);
  });

  it("should not remove a expired session that has a non-expired refresh token", async () => {
    const fourMonthsAgo = new Date(
      Date.now() - 1000 * 60 * 60 * 24 * 30 * 3,
    ).toISOString();

    const { data, db } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    // Add a client
    await data.clients.create("tenantId", {
      client_id: "clientId",
      client_secret: "clientSecret",
      name: "Test Client",
      callbacks: ["https://example.com/callback"],
      allowed_logout_urls: ["https://example.com/callback"],
      web_origins: ["https://example.com"],
      client_metadata: {
        disable_sign_ups: "false",
      },
    });

    // Add a test user
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

    await data.sessions.create("tenantId", {
      id: "sessionId",
      user_id: "email|userId",
      clients: ["clientId"],
      expires_at: fourMonthsAgo,
      used_at: new Date().toISOString(),
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
    });

    // Create the login session
    await data.loginSessions.create("tenantId", {
      expires_at: fourMonthsAgo,
      csrf_token: "csrfToken",
      session_id: "sessionId",
      authParams: {
        client_id: "clientId",
        username: "foo@exampl.com",
        scope: "",
        audience: "http://example.com",
        redirect_uri: "http://example.com/callback",
      },
    });

    // Create a refresh token
    await data.refreshTokens.create("tenantId", {
      id: "refreshToken",
      session_id: "sessionId",
      user_id: "email|userId",
      client_id: "clientId",
      expires_at: new Date().toISOString(),
      resource_servers: [
        {
          audience: "http://example.com",
          scopes: "openid",
        },
      ],
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
      rotating: false,
    });

    // Do the cleanup
    await data.cleanup();

    // Check that the login session still is there even though it's expired
    const loginSessions = await db
      .selectFrom("login_sessions")
      .selectAll()
      .execute();
    expect(loginSessions.length).toEqual(1);

    const sessions = await db.selectFrom("sessions").selectAll().execute();
    expect(sessions.length).toEqual(1);

    const refreshTokens = await db
      .selectFrom("refresh_tokens")
      .selectAll()
      .execute();
    expect(refreshTokens.length).toEqual(1);
  });
});
