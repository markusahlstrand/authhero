import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";
import { getTestServer } from "../helpers/test-server";
import { isConnectLoginSession } from "../../src/helpers/dcr/connect-state";

/**
 * Regression coverage for #1006: a cold (no-session) user who enters the DCR
 * `/connect/start` flow, gets bounced to login, and authenticates must be
 * handed back to `/u2/connect/start` — NOT dead-ended on the missing
 * redirect_uri. The connect login session carries `state_data.connect` and no
 * redirect_uri/response_type.
 */
describe("connect flow login continuation", () => {
  it("passwordless completion returns to /u2/connect/start with an auth cookie", async () => {
    const { universalApp, env } = await getTestServer({ mockEmail: true });
    const universalClient = testClient(universalApp, env);

    // State after /connect/start bounced a cold user to login and they
    // submitted their email: a connect login session (no redirect_uri, with a
    // username) plus a live OTP code linked to it.
    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      authParams: {
        client_id: "clientId",
        username: "connect-user@example.com",
        state: "csrf-abc",
      },
      csrf_token: "csrf-token",
      state_data: JSON.stringify({
        connect: {
          integration_type: "wordpress",
          domain: "publisher.com",
          return_to: "https://publisher.com/wp-admin/connect-callback",
          caller_state: "csrf-abc",
        },
      }),
    });

    await env.data.codes.create("tenantId", {
      code_id: "123456",
      code_type: "otp",
      login_id: loginSession.id,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });

    const response = await universalClient.login["email-otp-challenge"].$post({
      query: { state: loginSession.id },
      form: { code: "123456" },
    });

    expect(response.status).toBe(302);
    const location = response.headers.get("location");
    if (!location) throw new Error("No location header");
    const url = new URL(location, "http://localhost");
    expect(url.pathname).toBe("/u2/connect/start");
    expect(url.searchParams.get("state")).toBe(loginSession.id);

    // Auth cookie is set so the consent screen resolves the freshly
    // authenticated session.
    expect(response.headers.get("set-cookie")).toBeTruthy();

    // The session must NOT have been completed as an OAuth request.
    const after = await env.data.loginSessions.get("tenantId", loginSession.id);
    expect(after?.state).not.toBe("completed");
    expect(after?.session_id).toBeTruthy();
  });

  it("social completion returns to /u2/connect/start (redirect_uri guard relaxed)", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Connect login session (no redirect_uri) as created by /connect/start.
    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      authParams: { client_id: "clientId", state: "csrf-abc" },
      csrf_token: "csrf-token",
      state_data: JSON.stringify({
        connect: {
          domain: "publisher.com",
          return_to: "https://publisher.com/wp-admin/connect-callback",
          caller_state: "csrf-abc",
        },
      }),
    });

    // User picks the social connection on the connect login screen. /authorize
    // hydrates the connect session and dispatches to the strategy.
    const authorizeResponse = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          connection: "mock-strategy",
          state: loginSession.id,
          response_type: AuthorizationResponseType.CODE,
        },
      },
      { headers: { origin: "https://example.com" } },
    );
    expect(authorizeResponse.status).toBe(302);

    // Social callback must NOT 403 on the missing redirect_uri — it finalizes
    // and 302s to /authorize/resume.
    const callbackResponse = await oauthClient.login.callback.$get({
      query: { state: "code", code: "entra-mismatch" },
    });
    expect(callbackResponse.status).toBe(302);
    const resumeLocation = callbackResponse.headers.get("location");
    if (!resumeLocation) throw new Error("No resume location");
    const resumeUrl = new URL(resumeLocation, "http://localhost");
    expect(resumeUrl.pathname).toBe("/authorize/resume");

    // Following resume hands control back to the connect screen.
    const resumeResponse = await oauthApp.request(
      `/authorize/resume?state=${encodeURIComponent(loginSession.id)}`,
      { method: "GET" },
      env,
    );
    expect(resumeResponse.status).toBe(302);
    const finalUrl = new URL(
      resumeResponse.headers.get("location")!,
      "http://localhost",
    );
    expect(finalUrl.pathname).toBe("/u2/connect/start");
    expect(finalUrl.searchParams.get("state")).toBe(loginSession.id);
  });
});

describe("isConnectLoginSession", () => {
  it("detects a connect session by state_data.connect", () => {
    expect(
      isConnectLoginSession(JSON.stringify({ connect: { domain: "x.com" } })),
    ).toBe(true);
  });

  it("returns false for non-connect / empty / malformed state_data", () => {
    expect(isConnectLoginSession(undefined)).toBe(false);
    expect(isConnectLoginSession(null)).toBe(false);
    expect(isConnectLoginSession("")).toBe(false);
    expect(isConnectLoginSession(JSON.stringify({ mfa_verified: true }))).toBe(
      false,
    );
    expect(isConnectLoginSession("{not json")).toBe(false);
  });
});
