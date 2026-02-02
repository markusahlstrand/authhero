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

describe("sessionCleanup", () => {
  it("should remove expired sessions for a specific user", async () => {
    const oneHourAgo = new Date(Date.now() - 1000 * 60 * 60).toISOString();
    const oneHourFromNow = new Date(Date.now() + 1000 * 60 * 60).toISOString();

    const { data, db } = await getTestServer();

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
    });

    // Create two users
    await data.users.create("tenantId", {
      email: "user1@example.com",
      email_verified: true,
      name: "User 1",
      nickname: "user1",
      picture: "https://example.com/user1.png",
      connection: "email",
      provider: "email",
      is_social: false,
      user_id: "email|user1",
    });

    await data.users.create("tenantId", {
      email: "user2@example.com",
      email_verified: true,
      name: "User 2",
      nickname: "user2",
      picture: "https://example.com/user2.png",
      connection: "email",
      provider: "email",
      is_social: false,
      user_id: "email|user2",
    });

    // Create expired session for user1
    await data.sessions.create("tenantId", {
      id: "session1",
      user_id: "email|user1",
      clients: ["clientId"],
      expires_at: oneHourAgo,
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
    });

    // Create expired refresh token for user1
    await data.refreshTokens.create("tenantId", {
      id: "refreshToken1",
      session_id: "session1",
      user_id: "email|user1",
      client_id: "clientId",
      expires_at: oneHourAgo,
      resource_servers: [{ audience: "http://example.com", scopes: "openid" }],
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

    // Create non-expired session for user2
    await data.sessions.create("tenantId", {
      id: "session2",
      user_id: "email|user2",
      clients: ["clientId"],
      expires_at: oneHourFromNow,
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
    });

    // Create non-expired refresh token for user2
    await data.refreshTokens.create("tenantId", {
      id: "refreshToken2",
      session_id: "session2",
      user_id: "email|user2",
      client_id: "clientId",
      expires_at: oneHourFromNow,
      resource_servers: [{ audience: "http://example.com", scopes: "openid" }],
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

    // Run cleanup for user1 only
    await data.sessionCleanup!({ tenant_id: "tenantId", user_id: "email|user1" });

    // Check that user1's expired data is gone
    const sessions = await db.selectFrom("sessions").selectAll().execute();
    expect(sessions.length).toEqual(1);
    expect(sessions[0].user_id).toEqual("email|user2");

    const refreshTokens = await db
      .selectFrom("refresh_tokens")
      .selectAll()
      .execute();
    expect(refreshTokens.length).toEqual(1);
    expect(refreshTokens[0].user_id).toEqual("email|user2");
  });

  it("should remove expired login sessions", async () => {
    const { data, db } = await getTestServer();

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
    });

    // Insert login session directly with expired timestamp (no active session connected)
    const oneHourAgoTs = Date.now() - 1000 * 60 * 60;
    await db
      .insertInto("login_sessions")
      .values({
        id: "expiredLoginSession",
        tenant_id: "tenantId",
        csrf_token: "csrfToken",
        user_id: "email|user1",
        authParams_client_id: "clientId",
        authParams_scope: "",
        authParams_audience: "http://example.com",
        authParams_redirect_uri: "http://example.com/callback",
        created_at_ts: oneHourAgoTs,
        updated_at_ts: oneHourAgoTs,
        expires_at_ts: oneHourAgoTs,
        state: "pending",
      })
      .execute();

    // Run cleanup for user1
    await data.sessionCleanup!({ tenant_id: "tenantId", user_id: "email|user1" });

    // Check that the expired login session is gone (no active session connected)
    const loginSessions = await db
      .selectFrom("login_sessions")
      .selectAll()
      .execute();
    expect(loginSessions.length).toEqual(0);
  });

  it("should not remove expired login sessions with active sessions connected", async () => {
    const oneHourFromNow = new Date(Date.now() + 1000 * 60 * 60).toISOString();

    const { data, db } = await getTestServer();

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
    });

    await data.users.create("tenantId", {
      email: "user1@example.com",
      email_verified: true,
      name: "User 1",
      nickname: "user1",
      picture: "https://example.com/user1.png",
      connection: "email",
      provider: "email",
      is_social: false,
      user_id: "email|user1",
    });

    // Insert login session directly with expired timestamp
    const oneHourAgoTs = Date.now() - 1000 * 60 * 60;
    await db
      .insertInto("login_sessions")
      .values({
        id: "expiredLoginSession",
        tenant_id: "tenantId",
        csrf_token: "csrfToken",
        user_id: "email|user1",
        authParams_client_id: "clientId",
        authParams_scope: "",
        authParams_audience: "http://example.com",
        authParams_redirect_uri: "http://example.com/callback",
        created_at_ts: oneHourAgoTs,
        updated_at_ts: oneHourAgoTs,
        expires_at_ts: oneHourAgoTs,
        state: "pending",
      })
      .execute();

    // Create an ACTIVE session connected to the expired login session
    await data.sessions.create("tenantId", {
      id: "session1",
      user_id: "email|user1",
      clients: ["clientId"],
      expires_at: oneHourFromNow,
      login_session_id: "expiredLoginSession",
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
    });

    // Run cleanup for user1
    await data.sessionCleanup!({ tenant_id: "tenantId", user_id: "email|user1" });

    // Check that the expired login session is NOT deleted (has active session)
    const loginSessions = await db
      .selectFrom("login_sessions")
      .selectAll()
      .execute();
    expect(loginSessions.length).toEqual(1);
    expect(loginSessions[0].id).toEqual("expiredLoginSession");

    // The session should still exist too
    const sessions = await db.selectFrom("sessions").selectAll().execute();
    expect(sessions.length).toEqual(1);
  });

  it("should not remove sessions with active refresh tokens", async () => {
    const oneHourAgo = new Date(Date.now() - 1000 * 60 * 60).toISOString();
    const oneHourFromNow = new Date(Date.now() + 1000 * 60 * 60).toISOString();

    const { data, db } = await getTestServer();

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
    });

    await data.users.create("tenantId", {
      email: "user1@example.com",
      email_verified: true,
      name: "User 1",
      nickname: "user1",
      picture: "https://example.com/user1.png",
      connection: "email",
      provider: "email",
      is_social: false,
      user_id: "email|user1",
    });

    // Create expired session for user1
    await data.sessions.create("tenantId", {
      id: "session1",
      user_id: "email|user1",
      clients: ["clientId"],
      expires_at: oneHourAgo,
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
    });

    // Create NON-expired refresh token for the expired session
    await data.refreshTokens.create("tenantId", {
      id: "refreshToken1",
      session_id: "session1",
      user_id: "email|user1",
      client_id: "clientId",
      expires_at: oneHourFromNow,
      resource_servers: [{ audience: "http://example.com", scopes: "openid" }],
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

    // Run cleanup for user1
    await data.sessionCleanup!({ tenant_id: "tenantId", user_id: "email|user1" });

    // Session should NOT be deleted because it has an active refresh token
    const sessions = await db.selectFrom("sessions").selectAll().execute();
    expect(sessions.length).toEqual(1);

    const refreshTokens = await db
      .selectFrom("refresh_tokens")
      .selectAll()
      .execute();
    expect(refreshTokens.length).toEqual(1);
  });

  it("should cleanup all tenants when no tenant_id is provided", async () => {
    const oneHourAgo = new Date(Date.now() - 1000 * 60 * 60).toISOString();

    const { data, db } = await getTestServer();

    // Create two tenants
    await data.tenants.create({
      id: "tenant1",
      friendly_name: "Tenant 1",
      audience: "https://tenant1.com",
      sender_email: "login@tenant1.com",
      sender_name: "Tenant1",
    });

    await data.tenants.create({
      id: "tenant2",
      friendly_name: "Tenant 2",
      audience: "https://tenant2.com",
      sender_email: "login@tenant2.com",
      sender_name: "Tenant2",
    });

    await data.clients.create("tenant1", {
      client_id: "client1",
      client_secret: "clientSecret",
      name: "Client 1",
      callbacks: ["https://tenant1.com/callback"],
      allowed_logout_urls: ["https://tenant1.com/callback"],
      web_origins: ["https://tenant1.com"],
    });

    await data.clients.create("tenant2", {
      client_id: "client2",
      client_secret: "clientSecret",
      name: "Client 2",
      callbacks: ["https://tenant2.com/callback"],
      allowed_logout_urls: ["https://tenant2.com/callback"],
      web_origins: ["https://tenant2.com"],
    });

    await data.users.create("tenant1", {
      email: "user@tenant1.com",
      email_verified: true,
      name: "User",
      nickname: "user",
      picture: "https://example.com/user.png",
      connection: "email",
      provider: "email",
      is_social: false,
      user_id: "email|user1",
    });

    await data.users.create("tenant2", {
      email: "user@tenant2.com",
      email_verified: true,
      name: "User",
      nickname: "user",
      picture: "https://example.com/user.png",
      connection: "email",
      provider: "email",
      is_social: false,
      user_id: "email|user2",
    });

    // Create expired sessions for both tenants
    await data.sessions.create("tenant1", {
      id: "session1",
      user_id: "email|user1",
      clients: ["client1"],
      expires_at: oneHourAgo,
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
    });

    await data.sessions.create("tenant2", {
      id: "session2",
      user_id: "email|user2",
      clients: ["client2"],
      expires_at: oneHourAgo,
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
    });

    // Run cleanup without tenant_id filter
    await data.sessionCleanup!();

    // Both sessions should be deleted
    const sessions = await db.selectFrom("sessions").selectAll().execute();
    expect(sessions.length).toEqual(0);
  });

  it("should only cleanup sessions for specified tenant", async () => {
    const oneHourAgo = new Date(Date.now() - 1000 * 60 * 60).toISOString();

    const { data, db } = await getTestServer();

    // Create two tenants
    await data.tenants.create({
      id: "tenant1",
      friendly_name: "Tenant 1",
      audience: "https://tenant1.com",
      sender_email: "login@tenant1.com",
      sender_name: "Tenant1",
    });

    await data.tenants.create({
      id: "tenant2",
      friendly_name: "Tenant 2",
      audience: "https://tenant2.com",
      sender_email: "login@tenant2.com",
      sender_name: "Tenant2",
    });

    await data.clients.create("tenant1", {
      client_id: "client1",
      client_secret: "clientSecret",
      name: "Client 1",
      callbacks: ["https://tenant1.com/callback"],
      allowed_logout_urls: ["https://tenant1.com/callback"],
      web_origins: ["https://tenant1.com"],
    });

    await data.clients.create("tenant2", {
      client_id: "client2",
      client_secret: "clientSecret",
      name: "Client 2",
      callbacks: ["https://tenant2.com/callback"],
      allowed_logout_urls: ["https://tenant2.com/callback"],
      web_origins: ["https://tenant2.com"],
    });

    await data.users.create("tenant1", {
      email: "user@tenant1.com",
      email_verified: true,
      name: "User",
      nickname: "user",
      picture: "https://example.com/user.png",
      connection: "email",
      provider: "email",
      is_social: false,
      user_id: "email|user1",
    });

    await data.users.create("tenant2", {
      email: "user@tenant2.com",
      email_verified: true,
      name: "User",
      nickname: "user",
      picture: "https://example.com/user.png",
      connection: "email",
      provider: "email",
      is_social: false,
      user_id: "email|user2",
    });

    // Create expired sessions for both tenants
    await data.sessions.create("tenant1", {
      id: "session1",
      user_id: "email|user1",
      clients: ["client1"],
      expires_at: oneHourAgo,
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
    });

    await data.sessions.create("tenant2", {
      id: "session2",
      user_id: "email|user2",
      clients: ["client2"],
      expires_at: oneHourAgo,
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
    });

    // Run cleanup only for tenant1
    await data.sessionCleanup!({ tenant_id: "tenant1" });

    // Only tenant1's session should be deleted
    const sessions = await db.selectFrom("sessions").selectAll().execute();
    expect(sessions.length).toEqual(1);
    expect(sessions[0].tenant_id).toEqual("tenant2");
  });
});
