import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import bcryptjs from "bcryptjs";
import { getTestServer } from "../helpers/test-server";
import { USERNAME_PASSWORD_PROVIDER } from "../../src/constants";
import { Strategy } from "@authhero/adapter-interfaces";

function decodeScope(accessToken: string) {
  const payload = accessToken.split(".")[1];
  if (!payload) throw new Error("malformed access token");
  const claims: unknown = JSON.parse(
    Buffer.from(payload, "base64url").toString(),
  );
  if (typeof claims !== "object" || claims === null) {
    throw new Error("malformed access token claims");
  }
  return (claims as { scope?: string }).scope;
}

async function createPasswordUser(
  env: Awaited<ReturnType<typeof getTestServer>>["env"],
) {
  await env.data.users.create("tenantId", {
    email: "foo@example.com",
    email_verified: true,
    name: "Test User",
    nickname: "Test User",
    connection: Strategy.USERNAME_PASSWORD,
    provider: USERNAME_PASSWORD_PROVIDER,
    is_social: false,
    user_id: `${USERNAME_PASSWORD_PROVIDER}|userId`,
  });
  await env.data.passwords.create("tenantId", {
    user_id: `${USERNAME_PASSWORD_PROVIDER}|userId`,
    password: await bcryptjs.hash("Test1234!", 10),
    algorithm: "bcrypt",
  });
}

describe("cross-origin ticket flow scope handling", () => {
  it("carries the scope from /authorize through to the token exchange", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);
    await createPasswordUser(env);

    const loginResponse = await oauthClient.co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: Strategy.USERNAME_PASSWORD,
        password: "Test1234!",
        username: "foo@example.com",
      },
    });
    expect(loginResponse.status).toBe(200);
    const { login_ticket } = (await loginResponse.json()) as {
      login_ticket: string;
    };

    const authorizeResponse = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        login_ticket,
        realm: Strategy.USERNAME_PASSWORD,
        response_type: "code",
        redirect_uri: "https://example.com/callback",
        scope: "openid profile email offline_access",
        state: "state",
        nonce: "nonce",
      },
    });
    expect(authorizeResponse.status).toBe(302);
    const location = authorizeResponse.headers.get("location");
    if (!location) throw new Error("no redirect from /authorize");
    const code = new URL(location).searchParams.get("code");
    if (!code) throw new Error("no code in redirect");

    const tokenResponse = await oauthClient.oauth.token.$post({
      form: {
        grant_type: "authorization_code",
        client_id: "clientId",
        client_secret: "clientSecret",
        code,
        redirect_uri: "https://example.com/callback",
      },
    });
    expect(tokenResponse.status).toBe(200);

    const body = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
    };

    // offline_access reached the code exchange, so a refresh token is issued
    expect(body.refresh_token).toBeTypeOf("string");
    expect(decodeScope(body.access_token)).toContain("offline_access");
  });

  it("lets the scope from /authorize override the one from /co/authenticate", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);
    await createPasswordUser(env);

    const loginResponse = await oauthClient.co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: Strategy.USERNAME_PASSWORD,
        password: "Test1234!",
        username: "foo@example.com",
        scope: "openid",
      },
    });
    const { login_ticket } = (await loginResponse.json()) as {
      login_ticket: string;
    };

    const authorizeResponse = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        login_ticket,
        realm: Strategy.USERNAME_PASSWORD,
        response_type: "code",
        redirect_uri: "https://example.com/callback",
        scope: "openid profile email offline_access",
        state: "state",
      },
    });
    const location = authorizeResponse.headers.get("location");
    if (!location) throw new Error("no redirect from /authorize");
    const code = new URL(location).searchParams.get("code");
    if (!code) throw new Error("no code in redirect");

    const loginSession = await env.data.loginSessions.get(
      "tenantId",
      (await env.data.codes.get("tenantId", code, "authorization_code"))!
        .login_id,
    );
    expect(loginSession?.authParams.scope).toBe(
      "openid profile email offline_access",
    );
  });

  it("falls back to the scope from /co/authenticate when /authorize omits it", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);
    await createPasswordUser(env);

    const loginResponse = await oauthClient.co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: Strategy.USERNAME_PASSWORD,
        password: "Test1234!",
        username: "foo@example.com",
        scope: "openid profile email offline_access",
      },
    });
    const { login_ticket } = (await loginResponse.json()) as {
      login_ticket: string;
    };

    const authorizeResponse = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        login_ticket,
        realm: Strategy.USERNAME_PASSWORD,
        response_type: "code",
        redirect_uri: "https://example.com/callback",
        state: "state",
      },
    });
    const location = authorizeResponse.headers.get("location");
    if (!location) throw new Error("no redirect from /authorize");
    const code = new URL(location).searchParams.get("code");
    if (!code) throw new Error("no code in redirect");

    const tokenResponse = await oauthClient.oauth.token.$post({
      form: {
        grant_type: "authorization_code",
        client_id: "clientId",
        client_secret: "clientSecret",
        code,
        redirect_uri: "https://example.com/callback",
      },
    });
    expect(tokenResponse.status).toBe(200);
    const body = (await tokenResponse.json()) as { refresh_token?: string };
    expect(body.refresh_token).toBeTypeOf("string");
  });

  it("keeps the redirect_uri from /authorize on the login session", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);
    await createPasswordUser(env);

    const loginResponse = await oauthClient.co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: Strategy.USERNAME_PASSWORD,
        password: "Test1234!",
        username: "foo@example.com",
      },
    });
    const { login_ticket } = (await loginResponse.json()) as {
      login_ticket: string;
    };

    const authorizeResponse = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        login_ticket,
        realm: Strategy.USERNAME_PASSWORD,
        response_type: "code",
        redirect_uri: "https://example.com/callback",
        scope: "openid",
        state: "state",
      },
    });
    expect(authorizeResponse.status).toBe(302);

    const code = new URL(
      authorizeResponse.headers.get("location")!,
    ).searchParams.get("code")!;
    const authCode = await env.data.codes.get(
      "tenantId",
      code,
      "authorization_code",
    );
    const loginSession = await env.data.loginSessions.get(
      "tenantId",
      authCode!.login_id,
    );

    expect(loginSession?.authParams.redirect_uri).toBe(
      "https://example.com/callback",
    );
    // username from /co/authenticate must survive the merge
    expect(loginSession?.authParams.username).toBe("foo@example.com");
  });
});
