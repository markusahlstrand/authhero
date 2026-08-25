import { describe, expect, it } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { getAdminToken } from "../../helpers/token";
import { TokenResponse } from "@authhero/adapter-interfaces";
import { parseRefreshToken } from "../../../src/utils/refresh-token-format";
import { parseJWT } from "../../../src/utils/jwt";

interface StartOptions {
  email: string;
  authParams?: Record<string, unknown>;
}

async function startPasswordless(
  server: Awaited<ReturnType<typeof getTestServer>>,
  { email, authParams = {} }: StartOptions,
) {
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
        authParams,
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

describe("passwordless OTP grant at /oauth/token", () => {
  it("issues a refresh token when offline_access was requested at /passwordless/start", async () => {
    const server = await getTestServer({ testTenantLanguage: "en" });
    const { oauthApp, env } = server;
    const oauthClient = testClient(oauthApp, env);

    const code = await startPasswordless(server, {
      email: "offline@example.com",
      authParams: {
        scope: "openid profile email offline_access",
        audience: "http://example.com",
      },
    });

    const response = await oauthClient.oauth.token.$post(
      {
        form: {
          grant_type: "http://auth0.com/oauth/grant-type/passwordless/otp",
          otp: code,
          client_id: "clientId",
          realm: "email",
          username: "offline@example.com",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as TokenResponse;
    expect(body.access_token).toBeTypeOf("string");
    expect(body.refresh_token).toBeTypeOf("string");

    // The scope survives onto the access token, as it did before the fix.
    const accessToken = parseJWT(body.access_token!);
    expect((accessToken?.payload as { scope?: string }).scope).toContain(
      "offline_access",
    );

    // The refresh token must be tied to a session, otherwise the refresh grant
    // treats it as a legacy row and a session revoke can't reach it.
    const parsed = parseRefreshToken(body.refresh_token!);
    if (parsed.kind !== "new") {
      throw new Error("expected new-format wire token");
    }
    const row = await env.data.refreshTokens.getByLookup(
      "tenantId",
      parsed.lookup,
    );
    expect(row).toBeTruthy();
    expect(row!.session_id).toBeTypeOf("string");
    expect(row!.auth_connection).toBe("email");
    expect(row!.auth_strategy?.strategy_type).toBe("passwordless");

    const session = await env.data.sessions.get("tenantId", row!.session_id!);
    expect(session).toBeTruthy();
    expect(session!.user_id).toBe(row!.user_id);

    // ...and it actually works at the refresh grant.
    const refreshResponse = await oauthClient.oauth.token.$post(
      {
        form: {
          grant_type: "refresh_token",
          refresh_token: body.refresh_token!,
          client_id: "clientId",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );
    expect(refreshResponse.status).toBe(200);
    const refreshed = (await refreshResponse.json()) as TokenResponse;
    expect(refreshed.access_token).toBeTypeOf("string");
  });

  it("does not issue a refresh token when offline_access was not requested", async () => {
    const server = await getTestServer({ testTenantLanguage: "en" });
    const { oauthApp, env } = server;
    const oauthClient = testClient(oauthApp, env);

    const code = await startPasswordless(server, {
      email: "online@example.com",
      authParams: { scope: "openid profile email" },
    });

    const response = await oauthClient.oauth.token.$post(
      {
        form: {
          grant_type: "http://auth0.com/oauth/grant-type/passwordless/otp",
          otp: code,
          client_id: "clientId",
          realm: "email",
          username: "online@example.com",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as TokenResponse;
    expect(body.access_token).toBeTypeOf("string");
    expect(body.refresh_token).toBeUndefined();
  });

  it("accepts scope and audience on the grant itself, overriding the login session", async () => {
    const server = await getTestServer({ testTenantLanguage: "en" });
    const { oauthApp, env } = server;
    const oauthClient = testClient(oauthApp, env);

    // Nothing requested at start — Auth0 lets the exchange ask for it.
    const code = await startPasswordless(server, {
      email: "exchange-scope@example.com",
      authParams: {},
    });

    const response = await oauthClient.oauth.token.$post(
      {
        form: {
          grant_type: "http://auth0.com/oauth/grant-type/passwordless/otp",
          otp: code,
          client_id: "clientId",
          realm: "email",
          username: "exchange-scope@example.com",
          scope: "openid profile offline_access",
          audience: "http://example.com",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as TokenResponse;
    expect(body.refresh_token).toBeTypeOf("string");

    const accessToken = parseJWT(body.access_token!);
    const payload = accessToken?.payload as {
      scope?: string;
      aud?: string | string[];
    };
    expect(payload.scope).toContain("offline_access");
    expect(payload.aud).toBe("http://example.com");
  });
});
