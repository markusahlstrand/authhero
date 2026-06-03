import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { u2Screen } from "../../helpers/u2-screen";
import {
  AuthorizationResponseType,
  Strategy,
} from "@authhero/adapter-interfaces";

describe("identifier screen - social buttons with provider details", () => {
  it("should include provider_details with strategy for OIDC connections", async () => {
    const { u2App, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });

    // Add an OIDC connection with "vipps" in the name
    await env.data.connections.create("tenantId", {
      id: "vipps-oidc",
      name: "Vipps Login",
      display_name: "Vipps",
      strategy: "oidc",
      options: {
        client_id: "vipps-client-id",
        client_secret: "vipps-client-secret",
        authorization_endpoint:
          "https://api.vipps.no/access-management-1.0/access/oauth2/auth",
        token_endpoint:
          "https://api.vipps.no/access-management-1.0/access/oauth2/token",
        icon_url: "https://example.com/vipps-icon.svg",
      },
    });

    // Add a Google connection for comparison
    await env.data.connections.create("tenantId", {
      id: "google",
      name: "google-oauth2",
      strategy: "google-oauth2",
      options: {
        client_id: "google-client-id",
        client_secret: "google-client-secret",
      },
    });

    // Update client to have these connections in order
    await env.data.clientConnections.updateByClient("tenantId", "clientId", [
      "vipps-oidc",
      "google",
    ]);

    const oauthClient = testClient(oauthApp, env);
    const u2Client = testClient(u2App, env);

    // Start OAuth authorization flow
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

    // GET u2 identifier page - this should render the SSR widget with social buttons
    const response = await u2Screen(u2App, env, "login/identifier").$get({
      query: { state },
    });

    expect(response.status).toBe(200);
    const html = await response.text();

    // Verify the page contains the authhero-widget
    expect(html).toContain("authhero-widget");

    // The widget should have screen data with provider_details
    // Check that "Vipps Login" connection is included
    expect(html).toContain("Vipps Login");

    // The widget receives its screen JSON as raw text inside a
    // <script type="application/json" data-authhero="screen"> child, so
    // quotes are not HTML-entity-encoded.
    expect(html).toContain("provider_details");
    expect(html).toContain('"strategy":"oidc"');
    expect(html).toContain(
      '"icon_url":"https://example.com/vipps-icon.svg"',
    );
    expect(html).toContain('"display_name":"Continue with Vipps"');

    // Also verify the widget rendered the icon correctly
    expect(html).toContain('<img class="social-icon');
    expect(html).toContain('src="https://example.com/vipps-icon.svg"');
    expect(html).toContain('alt="Continue with Vipps"');
  });

  it("should render social buttons with custom icons for OIDC connections named after known providers", async () => {
    const { u2App, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });

    // Add an OIDC connection with "Vipps" in the name but no custom icon
    // The widget should fall back to the built-in Vipps icon
    await env.data.connections.create("tenantId", {
      id: "vipps-oidc-no-icon",
      name: "Vipps OIDC",
      display_name: "Vipps",
      strategy: "oidc",
      options: {
        client_id: "vipps-client-id",
        client_secret: "vipps-client-secret",
        authorization_endpoint: "https://api.vipps.no/auth",
        token_endpoint: "https://api.vipps.no/token",
      },
    });

    // Update client to have this connection AND the default username-password connection
    await env.data.clientConnections.updateByClient("tenantId", "clientId", [
      "vipps-oidc-no-icon",
      Strategy.USERNAME_PASSWORD, // Keep the default connection so the form can work
    ]);

    const oauthClient = testClient(oauthApp, env);
    const u2Client = testClient(u2App, env);

    // Start OAuth authorization flow
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

    // GET u2 identifier page
    const response = await u2Screen(u2App, env, "login/identifier").$get({
      query: { state },
    });

    expect(response.status).toBe(200);
    const html = await response.text();

    // Verify the provider_details includes the oidc strategy and Vipps
    // display name. The widget receives screen JSON as raw text inside a
    // <script type="application/json"> child — no HTML entity encoding.
    expect(html).toContain("provider_details");
    expect(html).toContain('"strategy":"oidc"');
    expect(html).toContain('"display_name":"Continue with Vipps"');

    // Even without a custom icon_url, the widget should recognize "Vipps" in the name
    // and use the built-in Vipps icon (or fallback gracefully)
    expect(html).toContain("Continue with Vipps");
  });

  it("should pass connections in correct order as specified by client", async () => {
    const { u2App, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });

    // Add multiple social connections with OIDC strategy which is always valid
    await env.data.connections.create("tenantId", {
      id: "conn-first",
      name: "First Provider",
      display_name: "First",
      strategy: "oidc",
      options: {
        client_id: "first-client",
        client_secret: "first-secret",
        authorization_endpoint: "https://first.example.com/auth",
        token_endpoint: "https://first.example.com/token",
      },
    });

    await env.data.connections.create("tenantId", {
      id: "conn-second",
      name: "Second Provider",
      display_name: "Second",
      strategy: "oidc",
      options: {
        client_id: "second-client",
        client_secret: "second-secret",
        authorization_endpoint: "https://second.example.com/auth",
        token_endpoint: "https://second.example.com/token",
      },
    });

    await env.data.connections.create("tenantId", {
      id: "conn-third",
      name: "Third Provider",
      display_name: "Third",
      strategy: "oidc",
      options: {
        client_id: "third-client",
        client_secret: "third-secret",
        authorization_endpoint: "https://third.example.com/auth",
        token_endpoint: "https://third.example.com/token",
      },
    });

    // Set specific order: First, Second, Third (plus Username-Password-Authentication for form support)
    await env.data.clientConnections.updateByClient("tenantId", "clientId", [
      "conn-first",
      "conn-second",
      "conn-third",
      Strategy.USERNAME_PASSWORD,
    ]);

    const oauthClient = testClient(oauthApp, env);
    const u2Client = testClient(u2App, env);

    // Start OAuth authorization flow
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

    // GET u2 identifier page
    const response = await u2Screen(u2App, env, "login/identifier").$get({
      query: { state },
    });

    expect(response.status).toBe(200);
    const html = await response.text();

    // Check that providers are in the correct order in the HTML.
    // The screen JSON is delivered as a <script type="application/json">
    // child, so quotes are raw — no HTML entity encoding.
    const firstIndex = html.indexOf('"name":"First Provider"');
    const secondIndex = html.indexOf('"name":"Second Provider"');
    const thirdIndex = html.indexOf('"name":"Third Provider"');

    expect(firstIndex).toBeGreaterThan(-1);
    expect(secondIndex).toBeGreaterThan(-1);
    expect(thirdIndex).toBeGreaterThan(-1);

    // Verify order: First < Second < Third
    expect(firstIndex).toBeLessThan(secondIndex);
    expect(secondIndex).toBeLessThan(thirdIndex);
  });
});
