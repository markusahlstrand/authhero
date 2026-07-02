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

/**
 * Helper to start an OAuth flow and return the login state
 */
async function getLoginState(oauthClient: any) {
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
  const universalUrl = new URL(`https://example.com${location}`);
  const state = universalUrl.searchParams.get("state");
  if (!state) {
    throw new Error("No state found");
  }
  return state;
}

describe("login screen - passwordless button", () => {
  it("should show 'login with code' as a social-style button when email connection is available", async () => {
    const { u2App, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });

    // Set client connections to include both password and email
    await env.data.clientConnections.updateByClient("tenantId", "clientId", [
      Strategy.USERNAME_PASSWORD,
      "email",
    ]);

    const oauthClient = testClient(oauthApp, env);

    const state = await getLoginState(oauthClient);

    // GET the login screen via screen API (JSON)
    const response = await u2App.request(
      `/screen/login?state=${state}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
      env,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as any;

    // Find the social-buttons component
    const socialButtons = data.screen.components.find(
      (c: any) => c.id === "social-buttons",
    );

    expect(socialButtons).toBeDefined();
    expect(socialButtons.type).toBe("SOCIAL");

    // Find the passwordless provider in provider_details
    const passwordlessProvider = socialButtons.config.provider_details.find(
      (p: any) => p.href,
    );

    expect(passwordlessProvider).toBeDefined();
    expect(passwordlessProvider.href).toContain(
      "login-passwordless-identifier",
    );
  });

  it("should NOT show passwordless button when only password connection is available", async () => {
    const { u2App, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });

    const oauthClient = testClient(oauthApp, env);

    // Get login state first (authorize needs default connections to succeed)
    const state = await getLoginState(oauthClient);

    // Then restrict to only password connection, no email
    await env.data.clientConnections.updateByClient("tenantId", "clientId", [
      Strategy.USERNAME_PASSWORD,
    ]);

    // GET the login screen via screen API (JSON)
    const response = await u2App.request(
      `/screen/login?state=${state}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
      env,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as any;

    // Should NOT have any provider with href
    const socialButtons = data.screen.components.find(
      (c: any) => c.id === "social-buttons",
    );

    if (socialButtons) {
      const passwordlessProvider = socialButtons.config?.provider_details?.find(
        (p: any) => p.href,
      );
      expect(passwordlessProvider).toBeUndefined();
    }
  });

  it("should show passwordless button when connections fall back to all tenant connections", async () => {
    const { u2App, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });

    // Clear client connections so it falls back to all tenant connections
    // (which include email by default in test-server)
    await env.data.clientConnections.updateByClient("tenantId", "clientId", []);

    const oauthClient = testClient(oauthApp, env);

    const state = await getLoginState(oauthClient);

    // GET the login screen via screen API (JSON)
    const response = await u2App.request(
      `/screen/login?state=${state}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
      env,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as any;

    // With fallback to all tenant connections (email + password + mock-strategy),
    // the passwordless button should appear in social-buttons
    const socialButtons = data.screen.components.find(
      (c: any) => c.id === "social-buttons",
    );

    expect(socialButtons).toBeDefined();

    const passwordlessProvider = socialButtons.config.provider_details.find(
      (p: any) => p.href,
    );
    expect(passwordlessProvider).toBeDefined();
  });

  it("should show passwordless button in SSR HTML output", async () => {
    const { u2App, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });

    await env.data.clientConnections.updateByClient("tenantId", "clientId", [
      Strategy.USERNAME_PASSWORD,
      "email",
    ]);

    const oauthClient = testClient(oauthApp, env);
    const u2Client = testClient(u2App, env);

    const state = await getLoginState(oauthClient);

    // GET the login page (SSR HTML)
    const response = await u2Screen(u2App, env, "login").$get({
      query: { state },
    });

    expect(response.status).toBe(200);
    const html = await response.text();

    // The SSR HTML should contain the passwordless button as an <a> in social-buttons
    expect(html).toContain("login-passwordless-identifier");
    expect(html).toContain("social-buttons");
  });
});

describe("login screen - wrong password", () => {
  it("should show a translated error message, not the raw i18n key", async () => {
    const { u2App, oauthApp, env } = await getTestServer({
      mockEmail: true,
      testTenantLanguage: "en",
    });

    await env.data.users.create("tenantId", {
      email: "wrongpw@example.com",
      email_verified: true,
      name: "Wrong PW User",
      nickname: "wrongpw",
      picture: "https://example.com/test.png",
      connection: Strategy.USERNAME_PASSWORD,
      provider: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      user_id: `${USERNAME_PASSWORD_PROVIDER}|wrongPwUserId`,
    });
    await env.data.passwords.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|wrongPwUserId`,
      password: await bcryptjs.hash("Password1!", 10),
      algorithm: "bcrypt",
    });

    // The test server creates the connection with the username-password
    // provider strategy, but the combined login screen checks for
    // strategy === Strategy.USERNAME_PASSWORD.
    await env.data.connections.update("tenantId", Strategy.USERNAME_PASSWORD, {
      strategy: Strategy.USERNAME_PASSWORD,
    });

    const oauthClient = testClient(oauthApp, env);
    const state = await getLoginState(oauthClient);

    const response = await u2Screen(u2App, env, "login").$post({
      query: { state },
      form: { username: "wrongpw@example.com", password: "not-the-password" },
    });

    const html = await response.text();
    expect(html).toContain("Wrong username or password");
    expect(html).not.toContain("wrong-credentials");
  });
});
