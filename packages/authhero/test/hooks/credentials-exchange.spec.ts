import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { LogTypes, Strategy } from "@authhero/adapter-interfaces";
import { getTestServer } from "../helpers/test-server";
import { parseJWT } from "oslo/jwt";
import { nanoid } from "nanoid";
import { computeCodeChallenge } from "../../src/utils/crypto";
import { generateCodeVerifier } from "oslo/oauth2";
import {
  HookEvent,
  OnExecuteCredentialsExchangeAPI,
} from "../../src/types/Hooks";

describe("client-credentials-hooks", () => {
  it("should add a claim for a client", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    env.hooks = {
      onExecuteCredentialsExchange: async (
        event: HookEvent,
        api: OnExecuteCredentialsExchangeAPI,
      ) => {
        if (event.client?.client_id === "clientId") {
          api.accessToken.setCustomClaim("foo", "bar");
        }
      },
    };

    const response = await client.oauth.token.$post(
      {
        form: {
          grant_type: "client_credentials",
          client_id: "clientId",
          client_secret: "clientSecret",
          audience: "https://example.com",
        },
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { access_token: string };

    const accessToken = parseJWT(body.access_token);
    expect(accessToken?.payload).toMatchObject({
      sub: "clientId",
      iss: "http://localhost:3000/",
      aud: "https://example.com",
      foo: "bar",
    });
  });

  it("writes a FAILED_EXCHANGE audit log when a hook denies the exchange", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    env.hooks = {
      onExecuteCredentialsExchange: async (
        event: HookEvent,
        api: OnExecuteCredentialsExchangeAPI,
      ) => {
        if (event.client?.client_id === "clientId") {
          api.access.deny("policy_violation", "client exceeded quota");
        }
      },
    };

    const response = await client.oauth.token.$post(
      {
        form: {
          grant_type: "client_credentials",
          client_id: "clientId",
          client_secret: "clientSecret",
          audience: "https://example.com",
        },
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );

    expect(response.status).toBe(400);

    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 50,
      include_totals: true,
    });
    const denyLog = logs.find(
      (l) =>
        l.type === LogTypes.FAILED_EXCHANGE_ACCESS_TOKEN_FOR_CLIENT_CREDENTIALS,
    );
    expect(denyLog).toBeDefined();
    expect(denyLog?.description).toContain("Access denied");
    expect(denyLog?.description).toContain("policy_violation");
    expect(denyLog?.description).toContain("client exceeded quota");
  });

  it("should expose grant_type and organization on the event for client_credentials", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const organization = await env.data.organizations.create("tenantId", {
      name: "cc-org",
      display_name: "Client Credentials Org",
    });

    let capturedEvent: HookEvent | undefined;
    env.hooks = {
      onExecuteCredentialsExchange: async (
        event: HookEvent,
        _api: OnExecuteCredentialsExchangeAPI,
      ) => {
        capturedEvent = event;
      },
    };

    const response = await oauthClient.oauth.token.$post(
      {
        form: {
          grant_type: "client_credentials",
          client_id: "clientId",
          client_secret: "clientSecret",
          audience: "https://example.com",
          organization: organization.id,
        },
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );

    expect(response.status).toBe(200);
    expect(capturedEvent).toBeDefined();
    expect(capturedEvent!.grant_type).toBe("client_credentials");
    expect(capturedEvent!.organization).toMatchObject({
      id: organization.id,
      name: organization.name,
    });
  });

  it("should include connection info in the event for user-based flows", async () => {
    const { oauthApp, env, getSentEmails } = await getTestServer({
      testTenantLanguage: "en",
    });
    const oauthClient = testClient(oauthApp, env);

    let capturedEvent: HookEvent | undefined;

    env.hooks = {
      onExecuteCredentialsExchange: async (
        event: HookEvent,
        _api: OnExecuteCredentialsExchangeAPI,
      ) => {
        capturedEvent = event;
      },
    };

    // Start passwordless flow to get a code
    const startResponse = await oauthClient.passwordless.start.$post(
      {
        json: {
          client_id: "clientId",
          connection: "email",
          email: "foo@example.com",
          send: "code",
          authParams: {},
        },
      },
      {
        headers: {
          "x-real-ip": "1.2.3.4",
          "user-agent": "Mozilla/5.0",
        },
      },
    );
    expect(startResponse.status).toBe(200);

    const emails = getSentEmails();
    const code = emails[0]?.data.code;
    expect(code).toBeTruthy();

    // Exchange the OTP for tokens - this triggers createAuthTokens with a user
    const tokenResponse = await oauthClient.oauth.token.$post(
      {
        form: {
          grant_type: "http://auth0.com/oauth/grant-type/passwordless/otp",
          otp: code,
          client_id: "clientId",
          realm: "email",
          username: "foo@example.com",
        },
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );

    expect(tokenResponse.status).toBe(200);
    expect(capturedEvent).toBeDefined();
    expect(capturedEvent!.connection).toMatchObject({
      id: "email",
      name: "Email",
      strategy: Strategy.EMAIL,
    });
  });

  it("should fall back to user.connection when no session connection is set (authorization_code)", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // User authenticated via vipps; the token-exchange request carries no
    // ctx.var.connection and the login session has no auth_connection.
    const userId = `vipps|${nanoid()}`;
    await env.data.users.create("tenantId", {
      user_id: userId,
      email: "vipps-user@example.com",
      email_verified: true,
      phone_number: "+4712345678",
      provider: "vipps",
      connection: "vipps",
      is_social: true,
      login_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await env.data.connections.create("tenantId", {
      id: "vipps-conn",
      name: "vipps",
      strategy: "vipps" as Strategy,
      options: {},
    });

    let capturedEvent: HookEvent | undefined;
    env.hooks = {
      onExecuteCredentialsExchange: async (
        event: HookEvent,
        _api: OnExecuteCredentialsExchangeAPI,
      ) => {
        capturedEvent = event;
      },
    };

    // Login session deliberately has no auth_connection set.
    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: nanoid(),
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        scope: "openid",
        audience: "https://example.com",
      },
      user_id: userId,
    });

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await computeCodeChallenge(codeVerifier, "S256");

    const code = await env.data.codes.create("tenantId", {
      code_id: nanoid(32),
      code_type: "authorization_code",
      login_id: loginSession.id,
      expires_at: new Date(Date.now() + 300 * 1000).toISOString(),
      user_id: userId,
      redirect_uri: "https://example.com/callback",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    const tokenResponse = await oauthClient.oauth.token.$post(
      {
        form: {
          grant_type: "authorization_code",
          client_id: "clientId",
          code: code.code_id,
          redirect_uri: "https://example.com/callback",
          code_verifier: codeVerifier,
        },
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );

    expect(tokenResponse.status).toBe(200);
    expect(capturedEvent).toBeDefined();
    expect(capturedEvent!.connection).toBeDefined();
    expect(capturedEvent!.connection!.name).toBe("vipps");
    expect(capturedEvent!.connection!.id).toBe("vipps-conn");
    expect(capturedEvent!.connection!.strategy).toBe("vipps");
  });

  it("should leave connection undefined when neither session nor user has one", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    let capturedEvent: HookEvent | undefined;
    env.hooks = {
      onExecuteCredentialsExchange: async (
        event: HookEvent,
        _api: OnExecuteCredentialsExchangeAPI,
      ) => {
        capturedEvent = event;
      },
    };

    // client_credentials grant: no user, no session connection.
    const response = await oauthClient.oauth.token.$post(
      {
        form: {
          grant_type: "client_credentials",
          client_id: "clientId",
          client_secret: "clientSecret",
          audience: "https://example.com",
        },
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );

    expect(response.status).toBe(200);
    expect(capturedEvent).toBeDefined();
    expect(capturedEvent!.connection).toBeUndefined();
  });

  it("should carry the login session's auth_connection through the refresh_token grant", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const userId = `vipps|${nanoid()}`;
    await env.data.users.create("tenantId", {
      user_id: userId,
      email: "refresh-vipps@example.com",
      email_verified: true,
      provider: "vipps",
      connection: "vipps",
      is_social: true,
      login_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await env.data.connections.create("tenantId", {
      id: "vipps-conn",
      name: "vipps",
      strategy: "vipps" as Strategy,
      options: {},
    });

    // The original login session recorded the actual auth connection.
    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: nanoid(),
      authParams: {
        client_id: "clientId",
        scope: "openid",
        audience: "http://example.com",
      },
      user_id: userId,
      auth_connection: "vipps",
    });

    const idle_expires_at = new Date(Date.now() + 3600 * 1000).toISOString();
    await env.data.refreshTokens.create("tenantId", {
      id: "vippsRefreshToken",
      login_id: loginSession.id,
      user_id: userId,
      client_id: "clientId",
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
      idle_expires_at,
      expires_at: idle_expires_at,
    });

    let capturedEvent: HookEvent | undefined;
    env.hooks = {
      onExecuteCredentialsExchange: async (event: HookEvent) => {
        capturedEvent = event;
      },
    };

    const response = await client.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: "refresh_token",
          refresh_token: "vippsRefreshToken",
          client_id: "clientId",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    expect(response.status).toBe(200);
    expect(capturedEvent).toBeDefined();
    expect(capturedEvent!.connection).toBeDefined();
    expect(capturedEvent!.connection!.name).toBe("vipps");
    expect(capturedEvent!.connection!.id).toBe("vipps-conn");
    expect(capturedEvent!.connection!.strategy).toBe("vipps");
  });

  it("should fall back to user.connection in refresh_token grant when the session recorded none", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const userId = `vipps|${nanoid()}`;
    await env.data.users.create("tenantId", {
      user_id: userId,
      email: "refresh-fallback@example.com",
      email_verified: true,
      provider: "vipps",
      connection: "vipps",
      is_social: true,
      login_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await env.data.connections.create("tenantId", {
      id: "vipps-conn",
      name: "vipps",
      strategy: "vipps" as Strategy,
      options: {},
    });

    // Login session has no auth_connection recorded.
    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: nanoid(),
      authParams: {
        client_id: "clientId",
        scope: "openid",
        audience: "http://example.com",
      },
      user_id: userId,
    });

    const idle_expires_at = new Date(Date.now() + 3600 * 1000).toISOString();
    await env.data.refreshTokens.create("tenantId", {
      id: "fallbackRefreshToken",
      login_id: loginSession.id,
      user_id: userId,
      client_id: "clientId",
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
      idle_expires_at,
      expires_at: idle_expires_at,
    });

    let capturedEvent: HookEvent | undefined;
    env.hooks = {
      onExecuteCredentialsExchange: async (event: HookEvent) => {
        capturedEvent = event;
      },
    };

    const response = await client.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: "refresh_token",
          refresh_token: "fallbackRefreshToken",
          client_id: "clientId",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    expect(response.status).toBe(200);
    expect(capturedEvent).toBeDefined();
    expect(capturedEvent!.connection).toBeDefined();
    expect(capturedEvent!.connection!.name).toBe("vipps");
    expect(capturedEvent!.connection!.id).toBe("vipps-conn");
  });
});
