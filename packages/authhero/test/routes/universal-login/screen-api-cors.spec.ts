import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";

describe("screen-api CORS", () => {
  it("should allow any origin for screen API preflight requests", async () => {
    const { u2App, env } = await getTestServer();

    // Test preflight request with arbitrary origin
    const response = await u2App.request(
      "/screen/identifier?state=test-state",
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://custom-domain.example.com",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Content-Type",
        },
      },
      env,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "POST",
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
      "Content-Type",
    );
  });

  it("should set CORS headers on actual screen API GET requests", async () => {
    const { u2App, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });
    const oauthClient = testClient(oauthApp, env);

    // Start OAuth authorization flow to get a valid state
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

    // Make GET request with Origin header
    const response = await u2App.request(
      `/screen/identifier?state=${state}`,
      {
        method: "GET",
        headers: {
          Origin: "https://custom-domain.example.com",
          Accept: "application/json",
        },
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("should set CORS headers on actual screen API POST requests", async () => {
    const { u2App, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });
    const oauthClient = testClient(oauthApp, env);

    // Start OAuth authorization flow to get a valid state
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

    // Make POST request with Origin header
    const response = await u2App.request(
      `/screen/identifier?state=${state}`,
      {
        method: "POST",
        headers: {
          Origin: "https://custom-domain.example.com",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: { username: "test@example.com" },
        }),
      },
      env,
    );

    // Response should have CORS headers regardless of status
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("should use relative URLs in action field for cross-origin compatibility", async () => {
    const { u2App, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });
    const oauthClient = testClient(oauthApp, env);

    // Start OAuth authorization flow to get a valid state
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

    // Make GET request
    const response = await u2App.request(
      `/screen/identifier?state=${state}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
      env,
    );

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      screen: { action: string };
    };

    // Verify the action URL is relative (starts with /)
    // This ensures the browser will resolve it against the current origin
    expect(body.screen.action).toMatch(/^\/u2\/screen\//);
    expect(body.screen.action).not.toMatch(/^https?:\/\//);
  });
});
