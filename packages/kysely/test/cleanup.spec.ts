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
      login_id: "loginSessionId",
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
    await data.sessionCleanup!();

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

  it("should remove an expired login session even if it has a non-expired session", async () => {
    const fourMonthsAgo = new Date(
      Date.now() - 1000 * 60 * 60 * 24 * 30 * 3,
    ).toISOString();
    const oneHourFromNow = new Date(Date.now() + 1000 * 60 * 60).toISOString();

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
      expires_at: oneHourFromNow,
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

    // Create the login session with expired timestamp directly in DB
    // (loginSessions.create always sets expires_at_ts to now + 24h)
    const fourMonthsAgoTs = Date.now() - 1000 * 60 * 60 * 24 * 30 * 3;
    await db
      .insertInto("login_sessions")
      .values({
        id: "expiredLoginSession",
        tenant_id: "tenantId",
        csrf_token: "csrfToken",
        session_id: "sessionId",
        auth_params: JSON.stringify({
          client_id: "clientId",
          scope: "",
          audience: "http://example.com",
          redirect_uri: "http://example.com/callback",
        }),
        created_at_ts: fourMonthsAgoTs,
        updated_at_ts: fourMonthsAgoTs,
        expires_at_ts: fourMonthsAgoTs,
        state: "pending",
      })
      .execute();

    // Do the cleanup
    await data.sessionCleanup!();

    // Login session is expired so it gets deleted (in the new model,
    // its expires_at would have been extended on renewal if still active)
    const loginSessions = await db
      .selectFrom("login_sessions")
      .selectAll()
      .execute();
    expect(loginSessions.length).toEqual(0);

    // The non-expired session should still exist
    const sessions = await db.selectFrom("sessions").selectAll().execute();
    expect(sessions.length).toEqual(1);
  });

  it("should remove an expired session even if it has a non-expired refresh token", async () => {
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

    // Create the login session (not linked to the expired session, to avoid
    // the SQLite FK cascade from sessions.id → login_sessions.session_id which
    // PlanetScale doesn't enforce).
    const loginSession = await data.loginSessions.create("tenantId", {
      expires_at: fourMonthsAgo,
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        username: "foo@exampl.com",
        scope: "",
        audience: "http://example.com",
        redirect_uri: "http://example.com/callback",
      },
    });

    // Create a refresh token that expires in the future
    const oneHourFromNow = new Date(Date.now() + 1000 * 60 * 60).toISOString();
    await data.refreshTokens.create("tenantId", {
      id: "refreshToken",
      login_id: loginSession.id,
      user_id: "email|userId",
      client_id: "clientId",
      expires_at: oneHourFromNow,
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

    // Creating the refresh token should have extended the login_session's
    // expires_at_ts to match the refresh token — that's the invariant the
    // cleanup relies on.
    const loginSessionAfterCreate = await data.loginSessions.get(
      "tenantId",
      loginSession.id,
    );
    expect(loginSessionAfterCreate?.expires_at).toEqual(oneHourFromNow);

    // Do the cleanup
    await data.sessionCleanup!();

    // The login_session is no longer expired — it got bumped alongside the
    // refresh token — so it must survive cleanup.
    const loginSessions = await db
      .selectFrom("login_sessions")
      .selectAll()
      .execute();
    expect(loginSessions.length).toEqual(1);

    // The expired session is still deleted (it's not tied to the refresh token).
    const sessions = await db.selectFrom("sessions").selectAll().execute();
    expect(sessions.length).toEqual(0);

    // The non-expired refresh token should still exist
    const refreshTokens = await db
      .selectFrom("refresh_tokens")
      .selectAll()
      .execute();
    expect(refreshTokens.length).toEqual(1);
  });
});

describe("sessionCleanup", () => {
  it("should remove expired sessions for a specific user", async () => {
    // Grace period is 1 week, so use 2 weeks ago for expired records
    const twoWeeksAgo = new Date(
      Date.now() - 1000 * 60 * 60 * 24 * 14,
    ).toISOString();
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
      expires_at: twoWeeksAgo,
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
      login_id: "loginSession1",
      user_id: "email|user1",
      client_id: "clientId",
      expires_at: twoWeeksAgo,
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
      login_id: "loginSession2",
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
    await data.sessionCleanup!({
      tenant_id: "tenantId",
      user_id: "email|user1",
    });

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
    // Grace period is 1 week, so use 2 weeks ago for expired records
    const twoWeeksAgoTs = Date.now() - 1000 * 60 * 60 * 24 * 14;
    await db
      .insertInto("login_sessions")
      .values({
        id: "expiredLoginSession",
        tenant_id: "tenantId",
        csrf_token: "csrfToken",
        user_id: "email|user1",
        auth_params: JSON.stringify({
          client_id: "clientId",
          scope: "",
          audience: "http://example.com",
          redirect_uri: "http://example.com/callback",
        }),
        created_at_ts: twoWeeksAgoTs,
        updated_at_ts: twoWeeksAgoTs,
        expires_at_ts: twoWeeksAgoTs,
        state: "pending",
      })
      .execute();

    // Run cleanup for user1
    await data.sessionCleanup!({
      tenant_id: "tenantId",
      user_id: "email|user1",
    });

    // Check that the expired login session is gone (no active session connected)
    const loginSessions = await db
      .selectFrom("login_sessions")
      .selectAll()
      .execute();
    expect(loginSessions.length).toEqual(0);
  });

  it("keeps a login_session alive while it has an active session", async () => {
    // An active session must keep its parent login_session alive: sessions.create
    // bumps the login_session's expiry so cleanup never orphans the session by
    // reaping the login_session it still references.
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
    // Grace period is 1 week, so use 2 weeks ago for expired records
    const twoWeeksAgoTs = Date.now() - 1000 * 60 * 60 * 24 * 14;
    await db
      .insertInto("login_sessions")
      .values({
        id: "expiredLoginSession",
        tenant_id: "tenantId",
        csrf_token: "csrfToken",
        user_id: "email|user1",
        auth_params: JSON.stringify({
          client_id: "clientId",
          scope: "",
          audience: "http://example.com",
          redirect_uri: "http://example.com/callback",
        }),
        created_at_ts: twoWeeksAgoTs,
        updated_at_ts: twoWeeksAgoTs,
        expires_at_ts: twoWeeksAgoTs,
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
    await data.sessionCleanup!({
      tenant_id: "tenantId",
      user_id: "email|user1",
    });

    // Creating the active session bumped the (previously expired) login_session
    // forward, so cleanup retains it — the session is never orphaned.
    const loginSessions = await db
      .selectFrom("login_sessions")
      .selectAll()
      .execute();
    expect(loginSessions.length).toEqual(1);

    // The non-expired session should still exist
    const sessions = await db.selectFrom("sessions").selectAll().execute();
    expect(sessions.length).toEqual(1);
  });

  it("should remove expired sessions even if they have active refresh tokens", async () => {
    // Grace period is 1 week, so use 2 weeks ago for expired records
    const twoWeeksAgo = new Date(
      Date.now() - 1000 * 60 * 60 * 24 * 14,
    ).toISOString();
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
      login_session_id: "loginSession1",
      clients: ["clientId"],
      expires_at: twoWeeksAgo,
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
      login_id: "loginSession1",
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
    await data.sessionCleanup!({
      tenant_id: "tenantId",
      user_id: "email|user1",
    });

    // Expired session is deleted (in the new model, the session's expiry
    // would have been extended on renewal if still active)
    const sessions = await db.selectFrom("sessions").selectAll().execute();
    expect(sessions.length).toEqual(0);

    // Non-expired refresh token should still exist
    const refreshTokens = await db
      .selectFrom("refresh_tokens")
      .selectAll()
      .execute();
    expect(refreshTokens.length).toEqual(1);
  });

  it("should cleanup all tenants when no tenant_id is provided", async () => {
    // Grace period is 1 week, so use 2 weeks ago for expired records
    const twoWeeksAgo = new Date(
      Date.now() - 1000 * 60 * 60 * 24 * 14,
    ).toISOString();

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
      expires_at: twoWeeksAgo,
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
      expires_at: twoWeeksAgo,
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
    // Grace period is 1 week, so use 2 weeks ago for expired records
    const twoWeeksAgo = new Date(
      Date.now() - 1000 * 60 * 60 * 24 * 14,
    ).toISOString();

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
      expires_at: twoWeeksAgo,
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
      expires_at: twoWeeksAgo,
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

describe("codes cleanup", () => {
  type TestData = Awaited<ReturnType<typeof getTestServer>>["data"];

  async function setupTenant(data: TestData, id: string) {
    await data.tenants.create({
      id,
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });
  }

  const iso = (offsetMs: number) =>
    new Date(Date.now() + offsetMs).toISOString();

  it("deletes codes expired before the cutoff and keeps the rest", async () => {
    const { data, db } = await getTestServer();
    await setupTenant(data, "tenantId");

    // Expired two days ago — before a one-day-ago cutoff.
    await data.codes.create("tenantId", {
      code_id: "long-expired",
      code_type: "authorization_code",
      login_id: "login1",
      expires_at: iso(-1000 * 60 * 60 * 24 * 2),
    });

    // Expired, but only an hour ago — inside the grace window, so it must
    // survive a cutoff of one day ago.
    await data.codes.create("tenantId", {
      code_id: "recently-expired",
      code_type: "authorization_code",
      login_id: "login2",
      expires_at: iso(-1000 * 60 * 60),
    });

    // Still live.
    await data.codes.create("tenantId", {
      code_id: "live",
      code_type: "authorization_code",
      login_id: "login3",
      expires_at: iso(1000 * 60 * 60),
    });

    const cutoff = iso(-1000 * 60 * 60 * 24);
    const deleted = await data.codes.cleanup(cutoff);

    expect(deleted).toEqual(1);

    const remaining = await db
      .selectFrom("codes")
      .select("code_id")
      .orderBy("code_id")
      .execute();
    expect(remaining.map((r) => r.code_id)).toEqual([
      "live",
      "recently-expired",
    ]);
  });

  it("sweeps across tenants, since retention is not tenant-scoped", async () => {
    const { data, db } = await getTestServer();
    await setupTenant(data, "tenant1");
    await setupTenant(data, "tenant2");

    for (const tenant of ["tenant1", "tenant2"]) {
      await data.codes.create(tenant, {
        code_id: `expired-${tenant}`,
        code_type: "otp",
        login_id: "login1",
        expires_at: iso(-1000 * 60 * 60 * 24 * 2),
      });
    }

    const deleted = await data.codes.cleanup(iso(-1000 * 60 * 60 * 24));

    expect(deleted).toEqual(2);
    const remaining = await db.selectFrom("codes").selectAll().execute();
    expect(remaining.length).toEqual(0);
  });

  it("writes expires_at_ts alongside expires_at so the sweep is indexed", async () => {
    const { data, db } = await getTestServer();
    await setupTenant(data, "tenantId");

    const expiresAt = iso(1000 * 60 * 60);
    await data.codes.create("tenantId", {
      code_id: "code1",
      code_type: "authorization_code",
      login_id: "login1",
      expires_at: expiresAt,
    });

    const row = await db
      .selectFrom("codes")
      .select(["expires_at", "expires_at_ts"])
      .executeTakeFirstOrThrow();

    expect(row.expires_at).toEqual(expiresAt);
    expect(Number(row.expires_at_ts)).toEqual(new Date(expiresAt).getTime());
  });

  it("still sweeps rows written before expires_at_ts existed", async () => {
    const { data, db } = await getTestServer();
    await setupTenant(data, "tenantId");

    await data.codes.create("tenantId", {
      code_id: "legacy",
      code_type: "authorization_code",
      login_id: "login1",
      expires_at: iso(-1000 * 60 * 60 * 24 * 2),
    });

    // Model a row inserted by an app version older than the migration: the
    // numeric twin is missing, so only the varchar fallback can catch it.
    await db
      .updateTable("codes")
      .set({ expires_at_ts: null })
      .where("code_id", "=", "legacy")
      .execute();

    const deleted = await data.codes.cleanup(iso(-1000 * 60 * 60 * 24));

    expect(deleted).toEqual(1);
    const remaining = await db.selectFrom("codes").selectAll().execute();
    expect(remaining.length).toEqual(0);
  });

  it("stores an unparseable expires_at as already-expired rather than failing the insert", async () => {
    const { data, db } = await getTestServer();
    await setupTenant(data, "tenantId");

    // expires_at is only typed z.string(), so this is representable. The
    // insert must not blow up on the bigint column, and the row must stay
    // sweepable rather than being stranded forever.
    await data.codes.create("tenantId", {
      code_id: "garbage-expiry",
      code_type: "authorization_code",
      login_id: "login1",
      expires_at: "not-a-date",
    });

    const row = await db
      .selectFrom("codes")
      .select("expires_at_ts")
      .executeTakeFirstOrThrow();
    expect(Number(row.expires_at_ts)).toEqual(0);

    expect(await data.codes.cleanup(iso(-1000 * 60 * 60 * 24))).toEqual(1);
  });

  it("does not delete a live row whose expires_at_ts is missing", async () => {
    const { data, db } = await getTestServer();
    await setupTenant(data, "tenantId");

    await data.codes.create("tenantId", {
      code_id: "legacy-live",
      code_type: "authorization_code",
      login_id: "login1",
      expires_at: iso(1000 * 60 * 60),
    });

    await db
      .updateTable("codes")
      .set({ expires_at_ts: null })
      .where("code_id", "=", "legacy-live")
      .execute();

    const deleted = await data.codes.cleanup(iso(-1000 * 60 * 60 * 24));

    expect(deleted).toEqual(0);
    const remaining = await db.selectFrom("codes").selectAll().execute();
    expect(remaining.length).toEqual(1);
  });
});
