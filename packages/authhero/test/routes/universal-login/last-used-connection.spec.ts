import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import bcryptjs from "bcryptjs";
import { getTestServer } from "../../helpers/test-server";
import { u2Screen } from "../../helpers/u2-screen";
import { USERNAME_PASSWORD_PROVIDER } from "../../../src/constants";
import {
  AuthorizationResponseType,
  Strategy,
} from "@authhero/adapter-interfaces";
import type { UiScreen } from "@authhero/adapter-interfaces";
import type { Bindings } from "../../../src/types";

type TestServer = Awaited<ReturnType<typeof getTestServer>>;
type OauthClient = ReturnType<typeof testClient<TestServer["oauthApp"]>>;
type UniversalClient = ReturnType<
  typeof testClient<TestServer["universalApp"]>
>;

const LAST_USED_COOKIE = "tenantId-last-used-connection";

async function createPasswordUser(env: Bindings) {
  await env.data.users.create("tenantId", {
    email: "foo@example.com",
    email_verified: true,
    name: "Test User",
    nickname: "Test User",
    picture: "https://example.com/test.png",
    connection: Strategy.USERNAME_PASSWORD,
    provider: USERNAME_PASSWORD_PROVIDER,
    is_social: false,
    user_id: `${USERNAME_PASSWORD_PROVIDER}|userId`,
  });
  await env.data.passwords.create("tenantId", {
    user_id: `${USERNAME_PASSWORD_PROVIDER}|userId`,
    password: await bcryptjs.hash("password", 10),
    algorithm: "bcrypt",
    is_current: true,
  });
}

async function createGoogleConnection(env: Bindings) {
  await env.data.connections.create("tenantId", {
    id: "google",
    name: "google-oauth2",
    strategy: "google-oauth2",
    options: {
      client_id: "google-client-id",
      client_secret: "google-client-secret",
    },
  });
  await env.data.clientConnections.updateByClient("tenantId", "clientId", [
    Strategy.USERNAME_PASSWORD,
    "google",
  ]);
}

async function getLoginState(oauthClient: OauthClient) {
  const authorizeResponse = await oauthClient.authorize.$get({
    query: {
      client_id: "clientId",
      redirect_uri: "https://example.com/callback",
      state: "state",
      nonce: "nonce",
      scope: "openid email profile",
      response_type: AuthorizationResponseType.CODE,
    },
  });
  expect(authorizeResponse.status).toBe(302);
  const location = authorizeResponse.headers.get("location");
  const state = new URL(`https://example.com${location}`).searchParams.get(
    "state",
  );
  if (!state) {
    throw new Error("No state found");
  }
  return state;
}

/**
 * Extract provider_details from a screen-API JSON response, narrowing to the
 * SOCIAL component so the entries are fully typed.
 */
async function getProviderDetails(response: Response) {
  const data: { screen: UiScreen } = await response.json();
  const socialButtons = data.screen.components.find(
    (c) => c.id === "social-buttons",
  );
  if (!socialButtons || socialButtons.type !== "SOCIAL") {
    throw new Error("social-buttons SOCIAL component not found");
  }
  return socialButtons.config?.provider_details ?? [];
}

/**
 * Drive the classic /u password flow to completion and return the final
 * (302-to-callback) response, whose Set-Cookie headers we assert on.
 */
async function loginWithPassword(
  universalClient: UniversalClient,
  state: string,
  password: string,
) {
  const identifierResponse = await universalClient.login.identifier.$post({
    query: { state },
    form: { username: "foo@example.com" },
  });
  expect(identifierResponse.status).toBe(302);

  return universalClient["enter-password"].$post({
    query: { state },
    form: { password },
  });
}

describe("last used connection cookie", () => {
  it("does not write the cookie on successful login when the flag is off (default)", async () => {
    const { universalApp, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);
    await createPasswordUser(env);

    const state = await getLoginState(oauthClient);
    const response = await loginWithPassword(
      universalClient,
      state,
      "password",
    );

    expect(response.status).toBe(302);
    const cookies = response.headers.getSetCookie?.() || [];
    // The session cookie must still be set — only the hint cookie is gated.
    expect(cookies.some((c: string) => c.includes("auth-token"))).toBe(true);
    expect(cookies.some((c: string) => c.startsWith(LAST_USED_COOKIE))).toBe(
      false,
    );
  });

  it("writes the cookie on successful login when the tenant opts in", async () => {
    const { universalApp, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);
    await createPasswordUser(env);
    await env.data.promptSettings.set("tenantId", {
      show_last_used_connection: true,
    });

    const state = await getLoginState(oauthClient);
    const response = await loginWithPassword(
      universalClient,
      state,
      "password",
    );

    expect(response.status).toBe(302);

    const loginSession = await env.data.loginSessions.get("tenantId", state);
    expect(loginSession?.auth_connection).toBeTruthy();

    const cookies = response.headers.getSetCookie?.() || [];
    const lastUsedCookie = cookies.find((c: string) =>
      c.startsWith(LAST_USED_COOKIE),
    );
    expect(lastUsedCookie).toBeDefined();
    expect(lastUsedCookie).toContain(
      `${LAST_USED_COOKIE}=${loginSession!.auth_connection}`,
    );
    expect(lastUsedCookie).toContain("HttpOnly");
    // ~1 year, not the session cookie's 30 days
    expect(lastUsedCookie).toContain(`Max-Age=${365 * 24 * 60 * 60}`);
  });

  it("does not write the cookie on failed login even when the flag is on", async () => {
    const { universalApp, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);
    await createPasswordUser(env);
    await env.data.promptSettings.set("tenantId", {
      show_last_used_connection: true,
    });

    const state = await getLoginState(oauthClient);
    const response = await loginWithPassword(
      universalClient,
      state,
      "wrong-password",
    );

    expect(response.status).toBe(400);
    const cookies = response.headers.getSetCookie?.() || [];
    expect(cookies.some((c: string) => c.startsWith(LAST_USED_COOKIE))).toBe(
      false,
    );
  });
});

describe("last used badge on u2 screens", () => {
  it("marks the matching provider on the identifier screen (screen API)", async () => {
    const { u2App, oauthApp, env } = await getTestServer({ mockEmail: true });
    const oauthClient = testClient(oauthApp, env);
    await createGoogleConnection(env);
    await env.data.promptSettings.set("tenantId", {
      show_last_used_connection: true,
    });

    const state = await getLoginState(oauthClient);

    const response = await u2App.request(
      `/screen/identifier?state=${state}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          cookie: `${LAST_USED_COOKIE}=google-oauth2`,
        },
      },
      env,
    );

    expect(response.status).toBe(200);
    const providerDetails = await getProviderDetails(response);
    const google = providerDetails.find((p) => p.name === "google-oauth2");
    expect(google?.last_used).toBe(true);
    expect(google?.last_used_label).toBe("Last used");
  });

  it("marks the matching provider on the combined login screen (screen API)", async () => {
    const { u2App, oauthApp, env } = await getTestServer({ mockEmail: true });
    const oauthClient = testClient(oauthApp, env);
    await createGoogleConnection(env);
    await env.data.promptSettings.set("tenantId", {
      show_last_used_connection: true,
    });

    const state = await getLoginState(oauthClient);

    const response = await u2App.request(
      `/screen/login?state=${state}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          cookie: `${LAST_USED_COOKIE}=google-oauth2`,
        },
      },
      env,
    );

    expect(response.status).toBe(200);
    const providerDetails = await getProviderDetails(response);
    const google = providerDetails.find((p) => p.name === "google-oauth2");
    expect(google?.last_used).toBe(true);
    expect(google?.last_used_label).toBe("Last used");
  });

  it("renders the badge into the SSR page", async () => {
    const { u2App, oauthApp, env } = await getTestServer({ mockEmail: true });
    const oauthClient = testClient(oauthApp, env);
    await createGoogleConnection(env);
    await env.data.promptSettings.set("tenantId", {
      show_last_used_connection: true,
    });

    const state = await getLoginState(oauthClient);

    const response = await u2Screen(u2App, env, "login/identifier").$get({
      query: { state },
      header: { cookie: `${LAST_USED_COOKIE}=google-oauth2` },
    });

    expect(response.status).toBe(200);
    const html = await response.text();
    // Screen JSON is embedded raw in a <script type="application/json"> tag
    expect(html).toContain('"last_used":true');
    expect(html).toContain('"last_used_label":"Last used"');
  });

  it("shows no badge when the flag is off, even with a cookie present", async () => {
    const { u2App, oauthApp, env } = await getTestServer({ mockEmail: true });
    const oauthClient = testClient(oauthApp, env);
    await createGoogleConnection(env);

    const state = await getLoginState(oauthClient);

    const response = await u2App.request(
      `/screen/identifier?state=${state}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          cookie: `${LAST_USED_COOKIE}=google-oauth2`,
        },
      },
      env,
    );

    expect(response.status).toBe(200);
    const providerDetails = await getProviderDetails(response);
    const google = providerDetails.find((p) => p.name === "google-oauth2");
    expect(google).toBeDefined();
    expect(google?.last_used).toBeUndefined();
    expect(google?.last_used_label).toBeUndefined();
  });

  it("shows no badge for a stale cookie naming a connection this client no longer has", async () => {
    const { u2App, oauthApp, env } = await getTestServer({ mockEmail: true });
    const oauthClient = testClient(oauthApp, env);
    await createGoogleConnection(env);
    await env.data.promptSettings.set("tenantId", {
      show_last_used_connection: true,
    });

    const state = await getLoginState(oauthClient);

    const response = await u2App.request(
      `/screen/identifier?state=${state}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          cookie: `${LAST_USED_COOKIE}=facebook`,
        },
      },
      env,
    );

    expect(response.status).toBe(200);
    const providerDetails = await getProviderDetails(response);
    expect(providerDetails.length).toBeGreaterThan(0);
    for (const provider of providerDetails) {
      expect(provider.last_used).toBeUndefined();
    }
  });
});
