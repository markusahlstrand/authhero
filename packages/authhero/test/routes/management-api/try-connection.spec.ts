import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import bcryptjs from "bcryptjs";
import { Strategy } from "@authhero/adapter-interfaces";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import { USERNAME_PASSWORD_PROVIDER } from "../../../src/constants";

describe("POST /api/v2/connections/:id/try", () => {
  it("succeeds end-to-end against a database connection", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    await env.data.users.create("tenantId", {
      email: "testuser@example.com",
      email_verified: true,
      connection: Strategy.USERNAME_PASSWORD,
      provider: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      user_id: `${USERNAME_PASSWORD_PROVIDER}|tryUser`,
    });
    await env.data.passwords.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|tryUser`,
      password: await bcryptjs.hash("CorrectPassword123!", 10),
      algorithm: "bcrypt",
    });

    const response = await managementClient.connections[":id"].try.$post(
      {
        param: { id: "Username-Password-Authentication" },
        header: { "tenant-id": "tenantId" },
        json: {
          username: "testuser@example.com",
          password: "CorrectPassword123!",
        },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      mode: string;
      status: string;
      connection_id: string;
      connection_name: string;
      strategy: string;
      userinfo?: Record<string, unknown>;
    };
    expect(body.mode).toBe("inline");
    expect(body.status).toBe("success");
    expect(body.connection_name).toBe("Username-Password-Authentication");
    expect(body.strategy).toBe(USERNAME_PASSWORD_PROVIDER);
    expect(body.userinfo?.email).toBe("testuser@example.com");
  });

  it("surfaces an error when the database password is wrong", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    await env.data.users.create("tenantId", {
      email: "testuser@example.com",
      email_verified: true,
      connection: Strategy.USERNAME_PASSWORD,
      provider: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      user_id: `${USERNAME_PASSWORD_PROVIDER}|tryUser2`,
    });
    await env.data.passwords.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|tryUser2`,
      password: await bcryptjs.hash("CorrectPassword123!", 10),
      algorithm: "bcrypt",
    });

    const response = await managementClient.connections[":id"].try.$post(
      {
        param: { id: "Username-Password-Authentication" },
        header: { "tenant-id": "tenantId" },
        json: {
          username: "testuser@example.com",
          password: "WrongPassword!",
        },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      mode: string;
      status: string;
      error?: string;
    };
    expect(body.mode).toBe("inline");
    expect(body.status).toBe("error");
    expect(body.error).toBeDefined();
  });

  it("returns 404 when the connection does not exist", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const response = await managementClient.connections[":id"].try.$post(
      {
        param: { id: "does-not-exist" },
        header: { "tenant-id": "tenantId" },
        json: { username: "x", password: "y" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(404);
  });

  it("returns an authorize URL for a non-database connection (mock-strategy)", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const response = await managementClient.connections[":id"].try.$post(
      {
        param: { id: "mock-strategy" },
        header: { "tenant-id": "tenantId" },
        json: {},
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      mode: string;
      authorize_url: string;
      state: string;
      result_url: string;
      client_id: string;
      connection: { id: string; name: string; strategy: string };
    };
    expect(body.mode).toBe("redirect");
    expect(body.client_id).toMatch(/^authhero-try-connection-/);
    expect(body.connection.name).toBe("mock-strategy");

    const url = new URL(body.authorize_url);
    expect(url.pathname).toBe("/authorize");
    expect(url.searchParams.get("client_id")).toBe(body.client_id);
    expect(url.searchParams.get("connection")).toBe("mock-strategy");
    expect(url.searchParams.get("redirect_uri")).toBe(body.result_url);
    expect(url.searchParams.get("state")).toBe(body.state);

    // The reserved client should have been provisioned for this tenant.
    const client = await env.data.clients.get("tenantId", body.client_id);
    expect(client).toBeTruthy();
    expect(client?.callbacks).toContain(body.result_url);
  });

  it("drives the full OIDC/mock-strategy flow end-to-end via /authorize + callback", async () => {
    const { managementApp, oauthApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const oauthClientHono = testClient(oauthApp, env);
    const token = await getAdminToken();

    // 1. Initiate the test — receive the authorize URL.
    const initResponse = await managementClient.connections[":id"].try.$post(
      {
        param: { id: "mock-strategy" },
        header: { "tenant-id": "tenantId" },
        json: {},
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(initResponse.status).toBe(200);
    const init = (await initResponse.json()) as {
      authorize_url: string;
      state: string;
    };
    const authorizeUrl = new URL(init.authorize_url);

    // 2. Hit /authorize — it 302s to the upstream IdP and creates a login
    // session + an `oauth2_state` codes row tied to our test client.
    const authorizeResponse = await oauthClientHono.authorize.$get({
      query: Object.fromEntries(authorizeUrl.searchParams) as Record<
        string,
        string
      >,
    });
    expect(authorizeResponse.status).toBe(302);
    const upstreamUrl = new URL(authorizeResponse.headers.get("location")!);
    // mock-strategy redirects to https://example.com/authorize without forwarding state
    expect(upstreamUrl.hostname).toBe("example.com");

    // The `code` value persisted on the codes row is also the upstream state
    // (see strategies/index.ts contract). Recover it from the codes table —
    // mock-strategy uses the hardcoded string "code" so we look that up.
    const codeRow = await env.data.codes.get("tenantId", "code", "oauth2_state");
    expect(codeRow).toBeTruthy();

    // 3. Replay the IdP callback. The mock-strategy returns hello@example.com
    // by default and we surface that as the success payload + raw=null.
    const callbackResponse = await oauthClientHono.login.callback.$get({
      query: {
        state: "code",
        code: "foo@example.com",
      },
    });
    expect(callbackResponse.status).toBe(302);
    const resultUrl = new URL(callbackResponse.headers.get("location")!);
    expect(resultUrl.pathname).toBe("/u2/try-connection-result");
    const stateFromCallback = resultUrl.searchParams.get("state")!;

    // 4. The result lives on the loginSession.state_data — assert directly.
    const loginSession = await env.data.loginSessions.get(
      "tenantId",
      stateFromCallback,
    );
    expect(loginSession?.state_data).toBeTruthy();
    const stateData = JSON.parse(loginSession!.state_data!) as {
      try_connection_result: {
        status: string;
        connection_name: string;
        userinfo: { sub: string; email: string };
      };
    };
    expect(stateData.try_connection_result.status).toBe("success");
    expect(stateData.try_connection_result.connection_name).toBe(
      "mock-strategy",
    );
    expect(stateData.try_connection_result.userinfo.sub).toBe("foo");
    expect(stateData.try_connection_result.userinfo.email).toBe(
      "foo@example.com",
    );

    // 5. The test must NOT create a real user.
    const usersForSub = await env.data.users.list("tenantId", {
      q: "user_id:mock-strategy*",
    });
    expect(usersForSub.users.find((u) => u.user_id === "mock-strategy|foo")).toBeUndefined();
  });
});
