import { describe, it, expect, vi } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { nanoid } from "nanoid";

describe("callback", () => {
  it("should return a 403 if the state isn't found", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const response = await oauthClient.callback.$get({
      query: {
        state: "invalid",
        code: "code",
      },
    });

    expect(response.status).toEqual(403);
    const responseText = await response.text();
    expect(responseText).toEqual("State not found");
  });

  it("should return a 302 back to universal auth if there's an error", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
      },
    });

    const state = await env.data.codes.create("tenantId", {
      code_id: nanoid(),
      code_type: "oauth2_state",
      login_id: loginSession.id,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const response = await oauthClient.callback.$get({
      query: {
        state: state.code_id,
        error: "error",
        error_description: "error_description",
        error_code: "error_code",
      },
    });

    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    if (!location) {
      throw new Error("No location header");
    }
    const redirectUri = new URL(location);
    expect(redirectUri.pathname).toEqual("/u/login/identifier");
    expect(redirectUri.searchParams.get("error")).toEqual("error");
    expect(redirectUri.searchParams.get("state")).toEqual(loginSession.id);
  });

  it("should return a code response redirect for a connection user", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Create a connection to test against
    await env.data.connections.create("tenantId", {
      id: "connectionId",
      name: "mock-strategy",
      strategy: "mock-strategy",
      options: {
        client_id: "clientId",
        client_secret: "clientSecret",
      },
    });

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
      },
    });

    const state = await env.data.codes.create("tenantId", {
      code_id: nanoid(),
      code_type: "oauth2_state",
      login_id: loginSession.id,
      connection_id: "connectionId",
      code_verifier: "verifier",
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    // This will create a user that is merged with the default test user
    const response = await oauthClient.callback.$get({
      query: {
        state: state.code_id,
        code: "foo@example.com",
      },
    });

    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    if (!location) {
      throw new Error("No location header");
    }
    const redirectUri = new URL(location);
    expect(redirectUri.pathname).toEqual("/callback");

    const logs = await env.data.logs.list("tenantId");
    expect(logs).toHaveLength(1);

    const user = await env.data.users.get("tenantId", "email|userId");
    expect(user?.identities?.length).toBe(2);
  });

  it("should redirect to the callback endpoint on the original domain when domain doesn't match the current request", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Create a connection to test against
    await env.data.connections.create("tenantId", {
      id: "connectionId",
      name: "mock-strategy",
      strategy: "mock-strategy",
      options: {
        client_id: "clientId",
        client_secret: "clientSecret",
      },
    });

    // Create a custom domain for the tenant
    await env.data.customDomains.create("tenantId", {
      domain: "auth.example.com",
      custom_domain_id: "custom-domain-id",
      type: "auth0_managed_certs",
    });

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
      },
      // This login session was created with a request to auth.example.com
      authorization_url:
        "https://auth.example.com/authorize?client_id=clientId",
    });

    const state = await env.data.codes.create("tenantId", {
      code_id: nanoid(),
      code_type: "oauth2_state",
      login_id: loginSession.id,
      connection_id: "connectionId",
      code_verifier: "verifier",
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    // Make the callback request with a different host header
    const response = await oauthClient.callback.$get(
      {
        query: {
          state: state.code_id,
          code: "foo@example.com",
        },
      },
      {
        headers: {
          host: "authhero.com", // Different from the original auth.example.com
        },
      },
    );

    // Verify it's a 307 Temporary Redirect to preserve the HTTP method
    expect(response.status).toEqual(307);
    const location = response.headers.get("location");
    if (!location) {
      throw new Error("No location header");
    }

    // Verify it redirects to the callback on the original domain
    expect(location).toEqual(
      `https://auth.example.com/callback?state=${state.code_id}&code=foo%40example.com`,
    );

    // Verify no user operations were performed yet (since we're redirecting)
    const logs = await env.data.logs.list("tenantId");
    expect(logs).toHaveLength(0);
  });
});
