import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";

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
        authorization_endpoint: "https://api.vipps.no/access-management-1.0/access/oauth2/auth",
        token_endpoint: "https://api.vipps.no/access-management-1.0/access/oauth2/token",
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
    const response = await u2Client.login.identifier.$get({
      query: { state },
    });

    expect(response.status).toBe(200);
    const html = await response.text();

    // Verify the page contains the authhero-widget
    expect(html).toContain("authhero-widget");

    // The widget should have screen data with provider_details
    // Check that "Vipps Login" connection is included
    expect(html).toContain("Vipps Login");

    // Check that the screen JSON includes provider_details with strategy
    // The screen is passed as a JSON attribute to the widget (HTML-encoded)
    expect(html).toContain("provider_details");
    // Check for HTML-encoded JSON (quotes become &quot;)
    expect(html).toContain("&quot;strategy&quot;:&quot;oidc&quot;");
    expect(html).toContain("&quot;icon_url&quot;:&quot;https://example.com/vipps-icon.svg&quot;");
    expect(html).toContain("&quot;display_name&quot;:&quot;Vipps&quot;");
    
    // Also verify the widget rendered the icon correctly
    expect(html).toContain('<img class="social-icon');
    expect(html).toContain('src="https://example.com/vipps-icon.svg"');
    expect(html).toContain('alt="Vipps"');
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

    // Update client to have this connection AND the default auth2 connection
    await env.data.clientConnections.updateByClient("tenantId", "clientId", [
      "vipps-oidc-no-icon",
      "Username-Password-Authentication", // Keep the default connection so the form can work
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
    const response = await u2Client.login.identifier.$get({
      query: { state },
    });

    expect(response.status).toBe(200);
    const html = await response.text();

    // Verify the provider_details includes the oidc strategy and Vipps display name (HTML-encoded)
    expect(html).toContain("provider_details");
    expect(html).toContain("&quot;strategy&quot;:&quot;oidc&quot;");
    expect(html).toContain("&quot;display_name&quot;:&quot;Vipps&quot;");
    
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
      "Username-Password-Authentication",
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
    const response = await u2Client.login.identifier.$get({
      query: { state },
    });

    expect(response.status).toBe(200);
    const html = await response.text();

    // Check that providers are in the correct order in the HTML (HTML-encoded)
    // We expect First to appear before Second, and Second before Third
    const firstIndex = html.indexOf("&quot;name&quot;:&quot;First Provider&quot;");
    const secondIndex = html.indexOf("&quot;name&quot;:&quot;Second Provider&quot;");
    const thirdIndex = html.indexOf("&quot;name&quot;:&quot;Third Provider&quot;");

    expect(firstIndex).toBeGreaterThan(-1);
    expect(secondIndex).toBeGreaterThan(-1);
    expect(thirdIndex).toBeGreaterThan(-1);

    // Verify order: First < Second < Third
    expect(firstIndex).toBeLessThan(secondIndex);
    expect(secondIndex).toBeLessThan(thirdIndex);
  });
});
