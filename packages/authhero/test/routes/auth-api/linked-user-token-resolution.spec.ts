import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { parseJWT } from "oslo/jwt";
import { nanoid } from "nanoid";
import {
  AuthorizationResponseMode,
  AuthorizationResponseType,
} from "@authhero/adapter-interfaces";
import { getTestServer } from "../../helpers/test-server";
import { USERNAME_PASSWORD_PROVIDER } from "../../../src/constants";

interface TokenResponse {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
}

interface AccessTokenPayload {
  sub: string;
  [key: string]: unknown;
}

function isAccessTokenPayload(value: unknown): value is AccessTokenPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "sub" in value &&
    typeof (value as { sub: unknown }).sub === "string"
  );
}

describe("linked user token resolution", () => {
  it("refresh_token grant: secondary user's refresh token returns access token for primary", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const primaryUserId = `google-oauth2|${nanoid()}`;
    await env.data.users.create("tenantId", {
      user_id: primaryUserId,
      email: "linked@example.com",
      email_verified: true,
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
      login_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const secondaryUserId = `${USERNAME_PASSWORD_PROVIDER}|${nanoid()}`;
    await env.data.users.create("tenantId", {
      user_id: secondaryUserId,
      email: "linked@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      login_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      linked_to: primaryUserId,
    });

    const idle_expires_at = new Date(Date.now() + 1000 * 60 * 60).toISOString();
    await env.data.refreshTokens.create("tenantId", {
      id: "linkedRefreshToken",
      login_id: "loginSessionId",
      user_id: secondaryUserId,
      client_id: "clientId",
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
      idle_expires_at,
      expires_at: idle_expires_at,
    });

    const response = await client.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: "refresh_token",
          refresh_token: "linkedRefreshToken",
          client_id: "clientId",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as TokenResponse;
    const accessToken = parseJWT(body.access_token);
    if (!isAccessTokenPayload(accessToken?.payload)) {
      throw new Error("access token payload missing sub");
    }
    expect(accessToken.payload.sub).toBe(primaryUserId);
  });

  it("authorization_code grant: code minted for secondary returns access token for primary", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const primaryUserId = `google-oauth2|${nanoid()}`;
    await env.data.users.create("tenantId", {
      user_id: primaryUserId,
      email: "linked-code@example.com",
      email_verified: true,
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
      login_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const secondaryUserId = `${USERNAME_PASSWORD_PROVIDER}|${nanoid()}`;
    await env.data.users.create("tenantId", {
      user_id: secondaryUserId,
      email: "linked-code@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      login_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      linked_to: primaryUserId,
    });

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        scope: "openid",
        audience: "http://example.com",
        redirect_uri: "http://example.com/callback",
      },
    });

    await env.data.codes.create("tenantId", {
      code_type: "authorization_code",
      user_id: secondaryUserId,
      code_id: "linkedAuthCode",
      login_id: loginSession.id,
      expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
    });

    const response = await client.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: "authorization_code",
          code: "linkedAuthCode",
          redirect_uri: "http://example.com/callback",
          client_id: "clientId",
          client_secret: "clientSecret",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as TokenResponse;
    const accessToken = parseJWT(body.access_token);
    if (!isAccessTokenPayload(accessToken?.payload)) {
      throw new Error("access token payload missing sub");
    }
    expect(accessToken.payload.sub).toBe(primaryUserId);
  });

  it("silent auth: session for secondary returns access token for primary", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const primaryUserId = `google-oauth2|${nanoid()}`;
    await env.data.users.create("tenantId", {
      user_id: primaryUserId,
      email: "linked-silent@example.com",
      email_verified: true,
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
      login_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const secondaryUserId = `${USERNAME_PASSWORD_PROVIDER}|${nanoid()}`;
    await env.data.users.create("tenantId", {
      user_id: secondaryUserId,
      email: "linked-silent@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      login_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      linked_to: primaryUserId,
    });

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
      },
    });

    const session = await env.data.sessions.create("tenantId", {
      id: "linkedSessionId",
      user_id: secondaryUserId,
      used_at: new Date().toISOString(),
      login_session_id: loginSession.id,
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      idle_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      clients: ["clientId"],
    });

    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "state",
          prompt: "none",
          response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
          response_mode: AuthorizationResponseMode.WEB_MESSAGE,
        },
      },
      {
        headers: {
          origin: "https://example.com",
          cookie: `tenantId-auth-token=${session.id}`,
        },
      },
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    const accessTokenMatch = html.match(/"access_token":"([^"]+)"/);
    if (!accessTokenMatch) {
      throw new Error("access_token not found in iframe response");
    }
    const accessToken = parseJWT(accessTokenMatch[1]);
    if (!isAccessTokenPayload(accessToken?.payload)) {
      throw new Error("access token payload missing sub");
    }
    expect(accessToken.payload.sub).toBe(primaryUserId);
  });
});
