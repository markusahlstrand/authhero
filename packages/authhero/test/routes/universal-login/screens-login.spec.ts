import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";

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

describe("login screen - passwordless link", () => {
  it("should show 'login with code' link when email connection is available", async () => {
    const { u2App, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });

    // Set client connections to include both password and email
    await env.data.clientConnections.updateByClient("tenantId", "clientId", [
      "Username-Password-Authentication",
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

    // Find the passwordless-link component
    const passwordlessLink = data.screen.components.find(
      (c: any) => c.id === "passwordless-link",
    );

    expect(passwordlessLink).toBeDefined();
    expect(passwordlessLink.type).toBe("RICH_TEXT");
    expect(passwordlessLink.config.content).toContain(
      "login-passwordless-identifier",
    );
  });

  it("should NOT show 'login with code' link when only password connection is available", async () => {
    const { u2App, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });

    const oauthClient = testClient(oauthApp, env);

    // Get login state first (authorize needs default connections to succeed)
    const state = await getLoginState(oauthClient);

    // Then restrict to only password connection, no email
    await env.data.clientConnections.updateByClient("tenantId", "clientId", [
      "Username-Password-Authentication",
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

    // Should NOT have the passwordless-link component
    const passwordlessLink = data.screen.components.find(
      (c: any) => c.id === "passwordless-link",
    );

    expect(passwordlessLink).toBeUndefined();
  });

  it("should show 'login with code' link when connections fall back to all tenant connections", async () => {
    const { u2App, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });

    // Clear client connections so it falls back to all tenant connections
    // (which include email by default in test-server)
    await env.data.clientConnections.updateByClient(
      "tenantId",
      "clientId",
      [],
    );

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
    // the passwordless link should appear
    const passwordlessLink = data.screen.components.find(
      (c: any) => c.id === "passwordless-link",
    );

    expect(passwordlessLink).toBeDefined();
  });

  it("should show 'login with code' link in SSR HTML output", async () => {
    const { u2App, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });

    await env.data.clientConnections.updateByClient("tenantId", "clientId", [
      "Username-Password-Authentication",
      "email",
    ]);

    const oauthClient = testClient(oauthApp, env);
    const u2Client = testClient(u2App, env);

    const state = await getLoginState(oauthClient);

    // GET the login page (SSR HTML)
    const response = await u2Client.login.$get({
      query: { state },
    });

    expect(response.status).toBe(200);
    const html = await response.text();

    // The SSR HTML should contain the passwordless link
    expect(html).toContain("passwordless-link");
    expect(html).toContain("login-passwordless-identifier");
  });
});
