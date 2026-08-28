import { describe, expect, it } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { getAdminToken } from "../../helpers/token";

interface ErrorResponse {
  error: string;
  error_description: string;
}

type Server = Awaited<ReturnType<typeof getTestServer>>;

async function startPasswordless(server: Server, email: string) {
  const { oauthApp, managementApp, env, getSentEmails } = server;
  const oauthClient = testClient(oauthApp, env);
  const managementClient = testClient(managementApp, env);

  const token = await getAdminToken();
  await managementClient.email.providers.$post(
    {
      header: { "tenant-id": "tenantId" },
      json: { name: "mock-email", credentials: { api_key: "apiKey" } },
    },
    { headers: { authorization: `Bearer ${token}` } },
  );

  const response = await oauthClient.passwordless.start.$post(
    {
      json: {
        client_id: "clientId",
        connection: "email",
        email,
        send: "code",
        authParams: { scope: "openid profile email offline_access" },
      },
    },
    { headers: { "x-real-ip": "1.2.3.4", "user-agent": "Mozilla/5.0" } },
  );
  expect(response.status).toBe(200);

  const emails = await getSentEmails();
  const code = emails[emails.length - 1]?.data.code;
  if (!code) {
    throw new Error("No code found in email");
  }
  return code;
}

function exchangeOtp(server: Server, email: string, code: string) {
  const oauthClient = testClient(server.oauthApp, server.env);
  return oauthClient.oauth.token.$post(
    {
      form: {
        grant_type: "http://auth0.com/oauth/grant-type/passwordless/otp",
        otp: code,
        client_id: "clientId",
        realm: "email",
        username: email,
      },
    },
    { headers: { "tenant-id": "tenantId" } },
  );
}

async function countRows(server: Server) {
  const { env } = server;
  const sessions = await env.data.sessions.list("tenantId", {
    page: 0,
    per_page: 100,
    include_totals: false,
  });
  const refreshTokens = await env.data.refreshTokens.list("tenantId", {
    page: 0,
    per_page: 100,
    include_totals: false,
  });
  return {
    sessions: sessions.sessions.length,
    refreshTokens: refreshTokens.refresh_tokens.length,
  };
}

// Issue #1285: the client's `grant_types` allowlist must be evaluated before
// the grant flow runs. A rejected request must leave no trace — the OTP or
// authorization code stays usable and no session / refresh token is minted.
describe("client.grant_types is enforced before the grant flow runs", () => {
  it("rejecting the passwordless OTP grant does not burn the code or orphan rows", async () => {
    const server = await getTestServer({ testTenantLanguage: "en" });
    const { env } = server;

    await env.data.clients.update("tenantId", "clientId", {
      grant_types: ["authorization_code", "refresh_token"],
    });

    const email = "check-order@example.com";
    const code = await startPasswordless(server, email);
    const before = await countRows(server);

    const rejected = await exchangeOtp(server, email, code);
    expect(rejected.status).toBe(400);
    const body = (await rejected.json()) as ErrorResponse;
    expect(body.error).toBe("unauthorized_client");

    // No side effects: the code is still unused and nothing was minted.
    const storedCode = await env.data.codes.get("tenantId", code, "otp");
    expect(storedCode?.used_at).toBeFalsy();
    expect(await countRows(server)).toEqual(before);

    // Once the client allows the grant, the very same code still works — the
    // user does not have to request a new one.
    await env.data.clients.update("tenantId", "clientId", {
      grant_types: [
        "authorization_code",
        "refresh_token",
        "http://auth0.com/oauth/grant-type/passwordless/otp",
      ],
    });
    const accepted = await exchangeOtp(server, email, code);
    expect(accepted.status).toBe(200);

    const after = await countRows(server);
    expect(after.sessions).toBe(before.sessions + 1);
    expect(after.refreshTokens).toBe(before.refreshTokens + 1);
  });

  it("rejecting the authorization_code grant does not consume the code", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    await env.data.clients.update("tenantId", "clientId", {
      grant_types: ["client_credentials"],
    });

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        scope: "",
        audience: "http://example.com",
        redirect_uri: "http://example.com/callback",
      },
    });
    await env.data.codes.create("tenantId", {
      code_type: "authorization_code",
      user_id: "email|userId",
      code_id: "check-order-code",
      login_id: loginSession.id,
      expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
    });

    const exchange = () =>
      client.oauth.token.$post(
        // @ts-expect-error - testClient type requires both form and json
        {
          form: {
            grant_type: "authorization_code",
            code: "check-order-code",
            redirect_uri: "http://example.com/callback",
            client_id: "clientId",
            client_secret: "clientSecret",
          },
        },
        { headers: { "tenant-id": "tenantId" } },
      );

    const rejected = await exchange();
    expect(rejected.status).toBe(400);
    const body = (await rejected.json()) as ErrorResponse;
    expect(body.error).toBe("unauthorized_client");

    const storedCode = await env.data.codes.get(
      "tenantId",
      "check-order-code",
      "authorization_code",
    );
    expect(storedCode?.used_at).toBeFalsy();

    // Same code succeeds once the grant is allowed.
    await env.data.clients.update("tenantId", "clientId", {
      grant_types: ["authorization_code"],
    });
    const accepted = await exchange();
    expect(accepted.status).toBe(200);
  });

  it("an unknown client still fails with the grant handler's error", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const response = await client.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: "client_credentials",
          client_id: "does-not-exist",
          client_secret: "clientSecret",
          audience: "https://example.com",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: "Client not found" });
  });
});
