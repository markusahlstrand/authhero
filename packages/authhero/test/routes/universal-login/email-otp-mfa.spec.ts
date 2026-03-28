import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import {
  AuthorizationResponseType,
  LoginSessionState,
} from "@authhero/adapter-interfaces";
import { getAdminToken } from "../../helpers/token";

/**
 * Helper to enable OTP factor and set MFA policy to "always" on the test tenant.
 */
async function enableTotpMfa(managementApp: any, env: any, token: string) {
  // Enable OTP factor
  await managementApp.request(
    "/guardian/factors/otp",
    {
      method: "PUT",
      headers: {
        "tenant-id": "tenantId",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ enabled: true }),
    },
    env,
  );

  // Set MFA policy to "always"
  await managementApp.request(
    "/guardian/policies",
    {
      method: "PUT",
      headers: {
        "tenant-id": "tenantId",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(["all-applications"]),
    },
    env,
  );
}

describe("Email OTP with MFA", () => {
  it("should redirect to MFA enrollment after successful email OTP verification", async () => {
    const { universalApp, oauthApp, managementApp, u2App, env, getSentEmails } =
      await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });

    const token = await getAdminToken();
    await enableTotpMfa(managementApp, env, token);

    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    // Start OAuth flow
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

    // Enter email on identifier screen
    const enterEmailPostResponse = await universalClient.login.identifier.$post(
      {
        query: { state },
        form: { username: "foo@example.com" },
      },
    );

    expect(enterEmailPostResponse.status).toBe(302);

    // Get the OTP code from the sent email
    const emails = getSentEmails();
    expect(emails.length).toBeGreaterThan(0);
    const { code } = emails[0].data;
    expect(code).toBeTruthy();

    // Submit the OTP code via the u2 screen API (this is what the widget does)
    const otpResponse = await u2App.request(
      `/screen/email-otp-challenge?state=${encodeURIComponent(state)}`,
      {
        method: "POST",
        headers: {
          "tenant-id": "tenantId",
          "content-type": "application/json",
        },
        body: JSON.stringify({ data: { code } }),
      },
      env,
    );

    // Should succeed - either redirect to MFA enrollment or return screen data
    // The key assertion: it should NOT be a 400 error with "Invalid time value"
    const responseBody = await otpResponse.text();
    console.log(
      "OTP response status:",
      otpResponse.status,
      "body:",
      responseBody,
    );

    // With MFA enabled, we expect a redirect to the MFA enrollment page
    expect(otpResponse.status).toBe(200);
    const parsed = JSON.parse(responseBody);

    // Should redirect to MFA enrollment (TOTP since we enabled OTP factor)
    expect(parsed.redirect).toContain("/mfa/totp-enrollment");

    // Verify the login session is in AWAITING_MFA state
    const loginSession = await env.data.loginSessions.get("tenantId", state);
    expect(loginSession).toBeTruthy();
    expect(loginSession!.state).toBe(LoginSessionState.AWAITING_MFA);
  });

  it("should redirect to MFA enrollment after successful email OTP via legacy u1 route", async () => {
    const { universalApp, oauthApp, managementApp, env, getSentEmails } =
      await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });

    const token = await getAdminToken();
    await enableTotpMfa(managementApp, env, token);

    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    // Start OAuth flow
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

    // Enter email on identifier screen
    const enterEmailPostResponse = await universalClient.login.identifier.$post(
      {
        query: { state },
        form: { username: "foo@example.com" },
      },
    );

    expect(enterEmailPostResponse.status).toBe(302);

    // Get the OTP code from the sent email
    const emails = getSentEmails();
    expect(emails.length).toBeGreaterThan(0);
    const { code } = emails[0].data;
    expect(code).toBeTruthy();

    // Submit the OTP code via the legacy u1 form POST
    const otpResponse = await universalApp.request(
      `/login/email-otp-challenge?state=${encodeURIComponent(state)}`,
      {
        method: "POST",
        headers: {
          "tenant-id": "tenantId",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ code }).toString(),
      },
      env,
    );

    console.log("Legacy OTP response status:", otpResponse.status);

    // With MFA enabled, we expect a 302 redirect to MFA enrollment
    expect(otpResponse.status).toBe(302);
    const redirectLocation = otpResponse.headers.get("location");
    expect(redirectLocation).toContain("/mfa/totp-enrollment");

    // Verify the login session is in AWAITING_MFA state
    const loginSession = await env.data.loginSessions.get("tenantId", state);
    expect(loginSession).toBeTruthy();
    expect(loginSession!.state).toBe(LoginSessionState.AWAITING_MFA);
  });
});
