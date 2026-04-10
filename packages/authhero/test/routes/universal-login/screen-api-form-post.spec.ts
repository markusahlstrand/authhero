import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import {
  AuthorizationResponseType,
  LoginSessionState,
} from "@authhero/adapter-interfaces";
import { getTestServer } from "../../helpers/test-server";

describe("screen-api form-urlencoded POST", () => {
  /**
   * Helper: create a login session in AWAITING_MFA state with a user,
   * simulating the state when passkey enrollment is shown.
   */
  async function createMfaLoginSession(env: any) {
    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 600000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        scope: "openid email profile",
        response_type: AuthorizationResponseType.CODE,
        state: "state",
        nonce: "nonce",
      },
      user_id: "email|userId",
      state: LoginSessionState.AWAITING_MFA,
    });
    return loginSession;
  }

  it("should accept form-urlencoded POST without returning 500", async () => {
    const { u2App, env } = await getTestServer({ mockEmail: true });

    const loginSession = await createMfaLoginSession(env);

    // Visit GET first to generate WebAuthn challenge
    const getResponse = await u2App.request(
      `/screen/passkey-enrollment?state=${encodeURIComponent(loginSession.id)}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
      env,
    );
    expect(getResponse.status).toBe(200);

    // Now POST with form-urlencoded (simulating native form.submit())
    const formBody = new URLSearchParams({
      "credential-field": "invalid-json",
      "action-field": "register",
    });

    const postResponse = await u2App.request(
      `/screen/passkey-enrollment?state=${encodeURIComponent(loginSession.id)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: `http://localhost:3000/u2/passkey/enrollment?state=${encodeURIComponent(loginSession.id)}`,
        },
        body: formBody.toString(),
      },
      env,
    );

    // Should NOT be 500. The invalid credential JSON triggers an error screen,
    // which the middleware redirects back to the Referer.
    expect(postResponse.status).not.toBe(500);
  });

  it("should return 302 redirect for form-urlencoded error case using Referer", async () => {
    const { u2App, env } = await getTestServer({ mockEmail: true });

    const loginSession = await createMfaLoginSession(env);

    // Visit GET first to generate WebAuthn challenge
    await u2App.request(
      `/screen/passkey-enrollment?state=${encodeURIComponent(loginSession.id)}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
      env,
    );

    // POST with form-urlencoded and invalid credential
    const formBody = new URLSearchParams({
      "credential-field": "invalid-json",
      "action-field": "register",
    });

    const referer = `http://localhost:3000/u2/passkey/enrollment?state=${encodeURIComponent(loginSession.id)}`;
    const postResponse = await u2App.request(
      `/screen/passkey-enrollment?state=${encodeURIComponent(loginSession.id)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: referer,
        },
        body: formBody.toString(),
      },
      env,
    );

    // Error case should redirect back to the Referer page
    expect(postResponse.status).toBe(302);
    const location = postResponse.headers.get("location");
    expect(location).toContain("/u2/passkey/enrollment");
    expect(location).toContain("state=");
  });

  it("should return 302 redirect for form-urlencoded identifier submission", async () => {
    const { u2App, oauthApp, env } = await getTestServer({ mockEmail: true });
    const oauthClient = testClient(oauthApp, env);

    // Start OAuth flow to get a valid state
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
    const state = universalUrl.searchParams.get("state")!;

    // POST existing user email via form-urlencoded — handler should
    // return a redirect to the next screen (e.g. enter-password / OTP)
    const formBody = new URLSearchParams({
      username: "foo@example.com",
    });

    const postResponse = await u2App.request(
      `/screen/identifier?state=${encodeURIComponent(state)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: `http://localhost:3000/u2/login/identifier?state=${encodeURIComponent(state)}`,
        },
        body: formBody.toString(),
      },
      env,
    );

    // The identifier handler returns a screen result (next screen),
    // which the middleware redirects back to the Referer.
    expect(postResponse.status).toBe(302);
  });

  it("should still accept JSON POST (regression)", async () => {
    const { u2App, env } = await getTestServer({ mockEmail: true });

    const loginSession = await createMfaLoginSession(env);

    // Visit GET first to generate WebAuthn challenge
    await u2App.request(
      `/screen/passkey-enrollment?state=${encodeURIComponent(loginSession.id)}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
      env,
    );

    // POST with JSON (the widget path)
    const postResponse = await u2App.request(
      `/screen/passkey-enrollment?state=${encodeURIComponent(loginSession.id)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          data: {
            "credential-field": "invalid-json",
            "action-field": "register",
          },
        }),
      },
      env,
    );

    // JSON POST should return 200 with error screen (not 500)
    expect(postResponse.status).toBe(200);
    const body = (await postResponse.json()) as { screen: { name: string } };
    expect(body.screen).toBeTruthy();
  });

  it("should handle form-urlencoded POST for identifier screen", async () => {
    const { u2App, oauthApp, env } = await getTestServer({ mockEmail: true });
    const oauthClient = testClient(oauthApp, env);

    // Start OAuth flow to get a valid state
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
    const state = universalUrl.searchParams.get("state")!;

    // POST with form-urlencoded to the identifier screen
    const formBody = new URLSearchParams({
      username: "foo@example.com",
    });

    const postResponse = await u2App.request(
      `/screen/identifier?state=${encodeURIComponent(state)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: `http://localhost:3000/u2/login/identifier?state=${encodeURIComponent(state)}`,
        },
        body: formBody.toString(),
      },
      env,
    );

    // Should not be 500 - form-urlencoded should be handled
    expect(postResponse.status).not.toBe(500);
  });
});
