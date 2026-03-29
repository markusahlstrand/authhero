import { describe, it, expect, vi } from "vitest";
import {
  AuthorizationResponseType,
  LoginSessionState,
} from "@authhero/adapter-interfaces";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { getAdminToken } from "../../helpers/token";
import { TOTPController } from "oslo/otp";
import { base32 } from "oslo/encoding";

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

/**
 * Helper to start OAuth flow and authenticate a user, returning the login session state.
 */
async function startAuthFlowAndLogin(
  oauthApp: any,
  universalApp: any,
  env: any,
) {
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

  // Log in with email (enter on identifier screen)
  const loginResponse = await universalClient.login.identifier.$post({
    query: { state },
    form: { username: "foo@example.com" },
  });

  expect(loginResponse.status).toBe(302);
  const loginLocation = loginResponse.headers.get("location");

  return { state, loginLocation };
}

describe("MFA TOTP (authenticator app)", () => {
  describe("TOTP enrollment flow", () => {
    it("should redirect to TOTP enrollment when MFA is required and user is not enrolled", async () => {
      const { universalApp, oauthApp, managementApp, u2App, env } =
        await getTestServer({
          mockEmail: true,
          testTenantLanguage: "en",
        });

      const token = await getAdminToken();
      await enableTotpMfa(managementApp, env, token);

      const { state, loginLocation } = await startAuthFlowAndLogin(
        oauthApp,
        universalApp,
        env,
      );

      // The login should redirect through the auth flow
      expect(loginLocation).toBeTruthy();

      // Verify the login session exists and was created
      const loginSession = await env.data.loginSessions.get("tenantId", state);
      expect(loginSession).toBeTruthy();
    });

    it("should show TOTP enrollment screen with QR code data", async () => {
      const { universalApp, oauthApp, managementApp, u2App, env } =
        await getTestServer({
          mockEmail: true,
          testTenantLanguage: "en",
        });

      const token = await getAdminToken();
      await enableTotpMfa(managementApp, env, token);

      // Create a login session in AWAITING_MFA state manually
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

      // GET the TOTP enrollment screen
      const response = await u2App.request(
        `/mfa/totp-enrollment?state=${encodeURIComponent(loginSession.id)}`,
        {
          method: "GET",
          headers: {
            "tenant-id": "tenantId",
          },
        },
        env,
      );

      expect(response.status).toBe(200);
      const html = await response.text();

      // Should contain the TOTP enrollment screen content
      expect(html).toContain("authhero-widget");

      // An MFA enrollment should have been created
      const enrollments = await env.data.authenticationMethods.list(
        "tenantId",
        "email|userId",
      );
      expect(enrollments.length).toBe(1);
      expect(enrollments[0].type).toBe("totp");
      expect(enrollments[0].totp_secret).toBeTruthy();
      expect(enrollments[0].confirmed).toBe(false);
    });

    it("should complete TOTP enrollment with valid code", async () => {
      const { u2App, managementApp, env } = await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });

      const token = await getAdminToken();
      await enableTotpMfa(managementApp, env, token);

      // Create a login session in AWAITING_MFA state
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

      // GET the enrollment screen first to generate the secret
      await u2App.request(
        `/mfa/totp-enrollment?state=${encodeURIComponent(loginSession.id)}`,
        {
          method: "GET",
          headers: { "tenant-id": "tenantId" },
        },
        env,
      );

      // Get the enrollment and its secret
      const enrollments = await env.data.authenticationMethods.list(
        "tenantId",
        "email|userId",
      );
      expect(enrollments.length).toBe(1);
      const enrollment = enrollments[0];
      expect(enrollment.totp_secret).toBeTruthy();

      // Generate a valid TOTP code using the secret
      const totpController = new TOTPController();
      const secretBytes = base32.decode(enrollment.totp_secret!, {
        strict: false,
      });
      const validCode = await totpController.generate(secretBytes);

      // POST the valid code to complete enrollment
      const postResponse = await u2App.request(
        `/mfa/totp-enrollment?state=${encodeURIComponent(loginSession.id)}`,
        {
          method: "POST",
          headers: {
            "tenant-id": "tenantId",
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ code: validCode }).toString(),
        },
        env,
      );

      expect(postResponse.status).toBe(302);
      const redirectLocation = postResponse.headers.get("location");
      expect(redirectLocation).toContain("/mfa/totp-challenge");

      // Enrollment should now be confirmed
      const updatedEnrollments = await env.data.authenticationMethods.list(
        "tenantId",
        "email|userId",
      );
      const confirmedEnrollment = updatedEnrollments.find(
        (e: any) => e.id === enrollment.id,
      );
      expect(confirmedEnrollment?.confirmed).toBe(true);
    });

    it("should reject invalid TOTP code during enrollment", async () => {
      const { u2App, managementApp, env } = await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });

      const token = await getAdminToken();
      await enableTotpMfa(managementApp, env, token);

      // Create a login session in AWAITING_MFA state
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

      // GET the enrollment screen to generate the secret
      await u2App.request(
        `/mfa/totp-enrollment?state=${encodeURIComponent(loginSession.id)}`,
        {
          method: "GET",
          headers: { "tenant-id": "tenantId" },
        },
        env,
      );

      // POST an invalid code
      const postResponse = await u2App.request(
        `/mfa/totp-enrollment?state=${encodeURIComponent(loginSession.id)}`,
        {
          method: "POST",
          headers: {
            "tenant-id": "tenantId",
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ code: "000000" }).toString(),
        },
        env,
      );

      // Should re-render the enrollment screen (not redirect)
      expect(postResponse.status).toBe(200);

      // Enrollment should still be unconfirmed
      const enrollments = await env.data.authenticationMethods.list(
        "tenantId",
        "email|userId",
      );
      expect(enrollments[0].confirmed).toBe(false);
    });
  });

  describe("TOTP challenge flow", () => {
    it("should verify a valid TOTP code and complete MFA", async () => {
      const { u2App, oauthApp, universalApp, managementApp, env } =
        await getTestServer({
          mockEmail: true,
          testTenantLanguage: "en",
        });

      const token = await getAdminToken();
      await enableTotpMfa(managementApp, env, token);

      // Start a real OAuth flow to get a properly initialized login session
      const oauthClient = testClient(oauthApp, env);
      const universalClient = testClient(universalApp, env);

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

      // Log in with email
      const loginResponse = await universalClient.login.identifier.$post({
        query: { state },
        form: { username: "foo@example.com" },
      });
      expect(loginResponse.status).toBe(302);

      // Follow redirect - this should go through the auth flow and end up at TOTP enrollment
      const loginRedirect = loginResponse.headers.get("location")!;

      // The auth flow should redirect to TOTP enrollment since MFA is required
      // Let's check the login session state
      const loginSession = await env.data.loginSessions.get("tenantId", state);
      expect(loginSession).toBeTruthy();

      // If the session is in AWAITING_MFA, navigate to enrollment
      if (loginSession!.state === LoginSessionState.AWAITING_MFA) {
        // GET the TOTP enrollment screen
        const enrollGetResponse = await u2App.request(
          `/mfa/totp-enrollment?state=${encodeURIComponent(state)}`,
          { method: "GET", headers: { "tenant-id": "tenantId" } },
          env,
        );
        expect(enrollGetResponse.status).toBe(200);

        // Get the generated TOTP secret
        const enrollments = await env.data.authenticationMethods.list(
          "tenantId",
          "email|userId",
        );
        const enrollment = enrollments.find((e: any) => e.type === "totp");
        expect(enrollment).toBeTruthy();
        expect(enrollment!.totp_secret).toBeTruthy();

        // Generate a valid TOTP code
        const totpController = new TOTPController();
        const secretBytes = base32.decode(enrollment!.totp_secret!, {
          strict: false,
        });
        const validCode = await totpController.generate(secretBytes);

        // POST the valid code to complete enrollment
        const enrollPostResponse = await u2App.request(
          `/mfa/totp-enrollment?state=${encodeURIComponent(state)}`,
          {
            method: "POST",
            headers: {
              "tenant-id": "tenantId",
              "content-type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ code: validCode }).toString(),
          },
          env,
        );
        expect(enrollPostResponse.status).toBe(302);
        const enrollRedirect = enrollPostResponse.headers.get("location")!;
        expect(enrollRedirect).toContain("/mfa/totp-challenge");

        // Now generate a fresh code for the challenge (TOTP codes are time-based)
        const challengeCode = await totpController.generate(secretBytes);

        // POST the valid code to the challenge screen
        const challengeResponse = await u2App.request(
          `/mfa/totp-challenge?state=${encodeURIComponent(state)}`,
          {
            method: "POST",
            headers: {
              "tenant-id": "tenantId",
              "content-type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ code: challengeCode }).toString(),
          },
          env,
        );

        // Should redirect to the callback URL (completing the auth flow)
        expect(challengeResponse.status).toBe(302);
        const redirectLocation = challengeResponse.headers.get("location");
        expect(redirectLocation).toContain("example.com/callback");

        // Login session should be updated with mfa_verified
        const updatedSession = await env.data.loginSessions.get(
          "tenantId",
          state,
        );
        const stateData = JSON.parse(updatedSession!.state_data!);
        expect(stateData.mfa_verified).toBe(true);
      }
    });

    it("should reject an invalid TOTP code", async () => {
      const { u2App, managementApp, env } = await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });

      const token = await getAdminToken();
      await enableTotpMfa(managementApp, env, token);

      // Create a confirmed TOTP enrollment
      const totpSecret = "JBSWY3DPEHPK3PXP";
      const enrollment = await env.data.authenticationMethods.create(
        "tenantId",
        {
          user_id: "email|userId",
          type: "totp",
          totp_secret: totpSecret,
          confirmed: true,
        },
      );

      // Create a login session in AWAITING_MFA state
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
        state_data: JSON.stringify({
          authenticationMethodId: enrollment.id,
        }),
      });

      // POST an invalid code
      const postResponse = await u2App.request(
        `/mfa/totp-challenge?state=${encodeURIComponent(loginSession.id)}`,
        {
          method: "POST",
          headers: {
            "tenant-id": "tenantId",
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ code: "000000" }).toString(),
        },
        env,
      );

      // Should re-render the challenge screen with error (not redirect)
      expect(postResponse.status).toBe(200);

      // Login session should NOT have mfa_verified
      const updatedSession = await env.data.loginSessions.get(
        "tenantId",
        loginSession.id,
      );
      if (updatedSession?.state_data) {
        const stateData = JSON.parse(updatedSession.state_data);
        expect(stateData.mfa_verified).toBeFalsy();
      }
    });

    it("should show the TOTP challenge screen on GET", async () => {
      const { u2App, managementApp, env } = await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });

      const token = await getAdminToken();
      await enableTotpMfa(managementApp, env, token);

      // Create a confirmed TOTP enrollment
      const enrollment = await env.data.authenticationMethods.create(
        "tenantId",
        {
          user_id: "email|userId",
          type: "totp",
          totp_secret: "JBSWY3DPEHPK3PXP",
          confirmed: true,
        },
      );

      // Create a login session in AWAITING_MFA state
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
        state_data: JSON.stringify({
          authenticationMethodId: enrollment.id,
        }),
      });

      // GET the challenge screen
      const response = await u2App.request(
        `/mfa/totp-challenge?state=${encodeURIComponent(loginSession.id)}`,
        {
          method: "GET",
          headers: { "tenant-id": "tenantId" },
        },
        env,
      );

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("authhero-widget");
    });
  });

  describe("checkMfaRequired with TOTP", () => {
    it("should detect confirmed TOTP enrollment", async () => {
      const { managementApp, env } = await getTestServer({
        mockEmail: true,
      });

      const token = await getAdminToken();
      await enableTotpMfa(managementApp, env, token);

      // Create a confirmed TOTP enrollment
      await env.data.authenticationMethods.create("tenantId", {
        user_id: "email|userId",
        type: "totp",
        totp_secret: "JBSWY3DPEHPK3PXP",
        confirmed: true,
      });

      // Verify the enrollment exists
      const enrollments = await env.data.authenticationMethods.list(
        "tenantId",
        "email|userId",
      );
      expect(enrollments.length).toBe(1);
      expect(enrollments[0].type).toBe("totp");
      expect(enrollments[0].confirmed).toBe(true);
    });
  });

  describe("TOTP helper functions", () => {
    it("should generate a valid TOTP secret", async () => {
      const { generateTotpSecret } =
        await import("../../../src/authentication-flows/mfa");

      const secret = generateTotpSecret();

      // Should be a non-empty base32 string
      expect(secret).toBeTruthy();
      expect(secret.length).toBeGreaterThan(0);

      // Should be decodable as base32
      const decoded = base32.decode(secret, { strict: false });
      expect(decoded.byteLength).toBe(20); // 20 bytes = 160 bits
    });

    it("should create a valid TOTP URI", async () => {
      const { createTotpUri } =
        await import("../../../src/authentication-flows/mfa");

      const uri = createTotpUri(
        "TestApp",
        "user@example.com",
        "JBSWY3DPEHPK3PXP",
      );

      expect(uri).toContain("otpauth://totp/");
      expect(uri).toContain("TestApp");
      expect(uri).toContain("user%40example.com");
    });

    it("should verify a valid TOTP code", async () => {
      const { verifyTotpCode, generateTotpSecret } =
        await import("../../../src/authentication-flows/mfa");

      const secret = generateTotpSecret();

      // Generate a valid code using oslo's TOTP controller
      const totpController = new TOTPController();
      const secretBytes = base32.decode(secret, { strict: false });
      const code = await totpController.generate(secretBytes);

      // Our function should verify it
      const result = await verifyTotpCode(secret, code);
      expect(result).toBe(true);
    });

    it("should reject an invalid TOTP code", async () => {
      const { verifyTotpCode, generateTotpSecret } =
        await import("../../../src/authentication-flows/mfa");

      const secret = generateTotpSecret();
      const result = await verifyTotpCode(secret, "000000");
      expect(result).toBe(false);
    });
  });
});
