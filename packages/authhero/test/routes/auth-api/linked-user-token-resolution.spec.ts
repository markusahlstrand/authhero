import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { parseJWT } from "../../../src/utils/jwt";
import { nanoid } from "nanoid";
import {
  AuthorizationResponseMode,
  AuthorizationResponseType,
} from "@authhero/adapter-interfaces";
import { getTestServer } from "../../helpers/test-server";
import { createTestRefreshToken } from "../../helpers/refresh-token";
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

/**
 * Seed a two-hop cluster — `leaf -> mid -> root` — through the raw adapter,
 * which is the only way to produce one: every supported linking path is meant
 * to keep clusters a single hop deep (see `repointPrimary`). This reproduces
 * the corrupt state that consumer-authored `linked_to` writes and
 * `POST /users/{id}/identities` create today (issue #1250).
 *
 * Whatever fix lands, tokens minted from an identity anywhere in the cluster
 * must carry the canonical `sub` — downstream systems key entitlements off it,
 * so a mid-chain `sub` reads as a different person.
 */
async function seedTwoHopChain(
  env: Awaited<ReturnType<typeof getTestServer>>["env"],
  label: string,
) {
  const email = `linked-chain-${label}@example.com`;
  const common = {
    email,
    email_verified: true,
    login_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const rootId = `google-oauth2|${nanoid()}`;
  await env.data.users.create("tenantId", {
    ...common,
    user_id: rootId,
    provider: "google-oauth2",
    connection: "google-oauth2",
    is_social: true,
  });

  const midId = `${USERNAME_PASSWORD_PROVIDER}|${nanoid()}`;
  await env.data.users.create("tenantId", {
    ...common,
    user_id: midId,
    provider: USERNAME_PASSWORD_PROVIDER,
    connection: USERNAME_PASSWORD_PROVIDER,
    is_social: false,
    linked_to: rootId,
  });

  const leafId = `sms|${nanoid()}`;
  await env.data.users.create("tenantId", {
    ...common,
    user_id: leafId,
    provider: "sms",
    connection: "sms",
    phone_number: "+46700000000",
    is_social: false,
    linked_to: midId,
  });

  return { rootId, midId, leafId };
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
    const { wireToken } = await createTestRefreshToken(env, "tenantId", {
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
          refresh_token: wireToken,
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

  it("refresh_token grant: a two-hop chain still resolves to the cluster root", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const { rootId, leafId } = await seedTwoHopChain(env, "refresh");

    const idle_expires_at = new Date(Date.now() + 1000 * 60 * 60).toISOString();
    const { wireToken } = await createTestRefreshToken(env, "tenantId", {
      id: "chainRefreshToken",
      login_id: "loginSessionId",
      user_id: leafId,
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
          refresh_token: wireToken,
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
    expect(accessToken.payload.sub).toBe(rootId);
  });

  it("authorization_code grant: a two-hop chain still resolves to the cluster root", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const { rootId, leafId } = await seedTwoHopChain(env, "code");

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
      user_id: leafId,
      code_id: "chainAuthCode",
      login_id: loginSession.id,
      expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
    });

    const response = await client.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: "authorization_code",
          code: "chainAuthCode",
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
    expect(accessToken.payload.sub).toBe(rootId);
  });

  it("silent auth: a two-hop chain still resolves to the cluster root", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const { rootId, leafId } = await seedTwoHopChain(env, "silent");

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
      id: "chainSessionId",
      user_id: leafId,
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
    expect(accessToken.payload.sub).toBe(rootId);
  });

  it("userinfo: a two-hop chain still reports the cluster root", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const { rootId, leafId } = await seedTwoHopChain(env, "userinfo");

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        scope: "openid profile email",
        redirect_uri: "http://example.com/callback",
      },
    });

    await env.data.codes.create("tenantId", {
      code_type: "authorization_code",
      user_id: leafId,
      code_id: "chainUserinfoCode",
      login_id: loginSession.id,
      expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
    });

    const tokenResponse = await client.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: "authorization_code",
          code: "chainUserinfoCode",
          redirect_uri: "http://example.com/callback",
          client_id: "clientId",
          client_secret: "clientSecret",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );
    expect(tokenResponse.status).toBe(200);
    const { access_token } = (await tokenResponse.json()) as TokenResponse;

    // The profile a relying party reads back has to name the same identity the
    // token's `sub` does, or the two disagree about who logged in.
    const userinfoResponse = await client.userinfo.$get(
      {},
      {
        headers: {
          authorization: `Bearer ${access_token}`,
          "tenant-id": "tenantId",
        },
      },
    );

    expect(userinfoResponse.status).toBe(200);
    const profile = (await userinfoResponse.json()) as { sub?: string };
    expect(profile.sub).toBe(rootId);
  });
});
