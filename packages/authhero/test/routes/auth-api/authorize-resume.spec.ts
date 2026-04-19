import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { LoginSessionState } from "@authhero/adapter-interfaces";

describe("GET /authorize/resume", () => {
  it("returns 403 when the login session is not found", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const response = await oauthClient.authorize.resume.$get({
      query: { state: "does-not-exist" },
    });

    expect(response.status).toEqual(403);
  });

  it("rejects PENDING sessions with 400 (not authenticated yet)", async () => {
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

    const response = await oauthClient.authorize.resume.$get({
      query: { state: loginSession.id },
    });

    expect(response.status).toEqual(400);
  });

  it("rejects COMPLETED sessions with 409 (replay protection)", async () => {
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

    await env.data.loginSessions.update("tenantId", loginSession.id, {
      state: LoginSessionState.COMPLETED,
    });

    const response = await oauthClient.authorize.resume.$get({
      query: { state: loginSession.id },
    });

    expect(response.status).toEqual(409);
  });

  it("302s to /authorize/resume on the original authorization host when the browser is on the wrong domain", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
      },
      authorization_url:
        "https://auth.example.com/authorize?client_id=clientId",
    });

    // Put the session into a state where resume WOULD otherwise proceed —
    // but because the host mismatches we expect the cross-domain hop to
    // take priority and trigger before any state dispatch.
    await env.data.loginSessions.update("tenantId", loginSession.id, {
      state: LoginSessionState.AUTHENTICATED,
      user_id: "auth2|user",
    });

    const response = await oauthClient.authorize.resume.$get(
      { query: { state: loginSession.id } },
      { headers: { host: "authhero.com" } },
    );

    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    if (!location) throw new Error("No location header");
    const redirect = new URL(location);
    expect(redirect.origin).toEqual("https://auth.example.com");
    expect(redirect.pathname).toEqual("/authorize/resume");
    expect(redirect.searchParams.get("state")).toEqual(loginSession.id);
  });
});
