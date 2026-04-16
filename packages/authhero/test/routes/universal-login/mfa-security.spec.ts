import { describe, it, expect } from "vitest";
import { Context } from "hono";
import {
  AuthorizationResponseType,
  LoginSessionState,
} from "@authhero/adapter-interfaces";
import { getTestServer } from "../../helpers/test-server";
import { getAdminToken } from "../../helpers/token";
import { Bindings, Variables } from "../../../src/types";
import { getEnrichedClient } from "../../../src/helpers/client";
import { getPrimaryUserByEmail } from "../../../src/helpers/users";

/**
 * Helper to enable OTP factor and set MFA policy to "always" on the test tenant.
 */
async function enableTotpMfa(managementApp: any, env: any, token: string) {
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
 * Helper to enable both OTP and SMS factors.
 */
async function enableMultiFactorMfa(
  managementApp: any,
  env: any,
  token: string,
) {
  await enableTotpMfa(managementApp, env, token);

  await managementApp.request(
    "/guardian/factors/sms",
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
}

/**
 * Helper to create a login session in AWAITING_MFA state.
 */
async function createMfaLoginSession(
  env: any,
  options?: { state_data?: Record<string, unknown> },
) {
  return env.data.loginSessions.create("tenantId", {
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
    ...(options?.state_data && {
      state_data: JSON.stringify(options.state_data),
    }),
  });
}

describe("MFA security", () => {
  describe("enrollment bypass prevention", () => {
    it("should not show enrollment options on login-options when user has confirmed enrollments", async () => {
      const { managementApp, u2App, env } = await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });

      const token = await getAdminToken();
      await enableMultiFactorMfa(managementApp, env, token);

      // Create a confirmed TOTP enrollment
      await env.data.authenticationMethods.create("tenantId", {
        user_id: "email|userId",
        type: "totp",
        totp_secret: "JBSWY3DPEHPK3PXP",
        confirmed: true,
      });

      const loginSession = await createMfaLoginSession(env);

      // GET the login-options screen
      const response = await u2App.request(
        `/mfa/login-options?state=${encodeURIComponent(loginSession.id)}`,
        {
          method: "GET",
          headers: { "tenant-id": "tenantId" },
        },
        env,
      );

      expect(response.status).toBe(200);
      const html = await response.text();

      // Should show the confirmed TOTP enrollment as a challenge option
      expect(html).toContain("factor_");
      // Should NOT contain enrollment options
      expect(html).not.toContain("factor_enroll-totp");
      expect(html).not.toContain("factor_enroll-phone");
      expect(html).not.toContain("factor_enroll-passkey");
    });

    it("should show enrollment options on login-options when user has NO confirmed enrollments", async () => {
      const { managementApp, u2App, env } = await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });

      const token = await getAdminToken();
      await enableMultiFactorMfa(managementApp, env, token);

      // No enrollments created for the user
      const loginSession = await createMfaLoginSession(env);

      const response = await u2App.request(
        `/mfa/login-options?state=${encodeURIComponent(loginSession.id)}`,
        {
          method: "GET",
          headers: { "tenant-id": "tenantId" },
        },
        env,
      );

      expect(response.status).toBe(200);
      const html = await response.text();

      // Should contain enrollment options since user has no confirmed enrollments
      expect(html).toContain("factor_enroll-totp");
      expect(html).toContain("factor_enroll-phone");
    });

    it("should reject enrollment selection via login-options POST when user has confirmed enrollments", async () => {
      const { managementApp, u2App, env } = await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });

      const token = await getAdminToken();
      await enableMultiFactorMfa(managementApp, env, token);

      // Create a confirmed TOTP enrollment
      await env.data.authenticationMethods.create("tenantId", {
        user_id: "email|userId",
        type: "totp",
        totp_secret: "JBSWY3DPEHPK3PXP",
        confirmed: true,
      });

      const loginSession = await createMfaLoginSession(env);

      // Try to select enroll-phone via POST (crafted request bypassing UI)
      const response = await u2App.request(
        `/mfa/login-options?state=${encodeURIComponent(loginSession.id)}`,
        {
          method: "POST",
          headers: {
            "tenant-id": "tenantId",
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            "factor_enroll-phone": "true",
          }).toString(),
        },
        env,
      );

      // Should be rejected (403)
      expect(response.status).toBe(403);
    });

    it("should reject enrollment selection for enroll-totp via login-options POST when user has confirmed enrollments", async () => {
      const { managementApp, u2App, env } = await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });

      const token = await getAdminToken();
      await enableMultiFactorMfa(managementApp, env, token);

      // Create a confirmed phone enrollment
      await env.data.authenticationMethods.create("tenantId", {
        user_id: "email|userId",
        type: "phone",
        phone_number: "+1234567890",
        confirmed: true,
      });

      const loginSession = await createMfaLoginSession(env);

      // Try to select enroll-totp via POST
      const response = await u2App.request(
        `/mfa/login-options?state=${encodeURIComponent(loginSession.id)}`,
        {
          method: "POST",
          headers: {
            "tenant-id": "tenantId",
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            "factor_enroll-totp": "true",
          }).toString(),
        },
        env,
      );

      expect(response.status).toBe(403);
    });

    it("should block direct navigation to totp-enrollment when user has confirmed enrollments", async () => {
      const { managementApp, u2App, env } = await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
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

      const loginSession = await createMfaLoginSession(env);

      // Try to GET the totp-enrollment screen directly
      const response = await u2App.request(
        `/mfa/totp-enrollment?state=${encodeURIComponent(loginSession.id)}`,
        {
          method: "GET",
          headers: { "tenant-id": "tenantId" },
        },
        env,
      );

      expect(response.status).toBe(403);
    });

    it("should block direct POST to totp-enrollment when user has confirmed enrollments", async () => {
      const { managementApp, u2App, env } = await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
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

      const loginSession = await createMfaLoginSession(env);

      // Try to POST to totp-enrollment directly
      const response = await u2App.request(
        `/mfa/totp-enrollment?state=${encodeURIComponent(loginSession.id)}`,
        {
          method: "POST",
          headers: {
            "tenant-id": "tenantId",
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ code: "123456" }).toString(),
        },
        env,
      );

      expect(response.status).toBe(403);
    });

    it("should block direct navigation to phone-enrollment when user has confirmed enrollments", async () => {
      const { managementApp, u2App, env } = await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });

      const token = await getAdminToken();
      await enableMultiFactorMfa(managementApp, env, token);

      // Create a confirmed TOTP enrollment
      await env.data.authenticationMethods.create("tenantId", {
        user_id: "email|userId",
        type: "totp",
        totp_secret: "JBSWY3DPEHPK3PXP",
        confirmed: true,
      });

      const loginSession = await createMfaLoginSession(env);

      // Try to GET the phone-enrollment screen directly
      const response = await u2App.request(
        `/mfa/phone-enrollment?state=${encodeURIComponent(loginSession.id)}`,
        {
          method: "GET",
          headers: { "tenant-id": "tenantId" },
        },
        env,
      );

      expect(response.status).toBe(403);
    });

    it("should block direct POST to phone-enrollment when user has confirmed enrollments", async () => {
      const { managementApp, u2App, env } = await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });

      const token = await getAdminToken();
      await enableMultiFactorMfa(managementApp, env, token);

      // Create a confirmed TOTP enrollment
      await env.data.authenticationMethods.create("tenantId", {
        user_id: "email|userId",
        type: "totp",
        totp_secret: "JBSWY3DPEHPK3PXP",
        confirmed: true,
      });

      const loginSession = await createMfaLoginSession(env);

      // Try to POST to phone-enrollment directly
      const response = await u2App.request(
        `/mfa/phone-enrollment?state=${encodeURIComponent(loginSession.id)}`,
        {
          method: "POST",
          headers: {
            "tenant-id": "tenantId",
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            phone_number: "+9876543210",
          }).toString(),
        },
        env,
      );

      expect(response.status).toBe(403);
    });

    it("should block direct navigation to passkey-enrollment when user has confirmed enrollments", async () => {
      const { managementApp, u2App, env } = await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });

      const token = await getAdminToken();
      await enableMultiFactorMfa(managementApp, env, token);

      // Create a confirmed TOTP enrollment
      await env.data.authenticationMethods.create("tenantId", {
        user_id: "email|userId",
        type: "totp",
        totp_secret: "JBSWY3DPEHPK3PXP",
        confirmed: true,
      });

      const loginSession = await createMfaLoginSession(env);

      // Try to GET the passkey-enrollment screen directly
      const response = await u2App.request(
        `/passkey/enrollment?state=${encodeURIComponent(loginSession.id)}`,
        {
          method: "GET",
          headers: { "tenant-id": "tenantId" },
        },
        env,
      );

      expect(response.status).toBe(403);
    });

    it("should block direct POST to passkey-enrollment when user has confirmed enrollments", async () => {
      const { managementApp, u2App, env } = await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });

      const token = await getAdminToken();
      await enableMultiFactorMfa(managementApp, env, token);

      // Create a confirmed TOTP enrollment
      await env.data.authenticationMethods.create("tenantId", {
        user_id: "email|userId",
        type: "totp",
        totp_secret: "JBSWY3DPEHPK3PXP",
        confirmed: true,
      });

      const loginSession = await createMfaLoginSession(env);

      // Try to POST to passkey-enrollment directly
      const response = await u2App.request(
        `/passkey/enrollment?state=${encodeURIComponent(loginSession.id)}`,
        {
          method: "POST",
          headers: {
            "tenant-id": "tenantId",
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            "credential-field": "{}",
            "action-field": "register",
          }).toString(),
        },
        env,
      );

      expect(response.status).toBe(403);
    });

    it("should allow enrollment when user has no confirmed enrollments", async () => {
      const { managementApp, u2App, env } = await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });

      const token = await getAdminToken();
      await enableTotpMfa(managementApp, env, token);

      const loginSession = await createMfaLoginSession(env);

      // GET totp-enrollment should work when user has no enrollments
      const response = await u2App.request(
        `/mfa/totp-enrollment?state=${encodeURIComponent(loginSession.id)}`,
        {
          method: "GET",
          headers: { "tenant-id": "tenantId" },
        },
        env,
      );

      expect(response.status).toBe(200);

      // Should have created an unconfirmed enrollment
      const enrollments = await env.data.authenticationMethods.list(
        "tenantId",
        "email|userId",
      );
      expect(enrollments.length).toBe(1);
      expect(enrollments[0].confirmed).toBe(false);
    });
  });

  describe("passkey routing in MFA flow", () => {
    it("should route to passkey challenge when AWAITING_MFA with passkey authenticationMethodId", async () => {
      const { managementApp, env } = await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });

      const token = await getAdminToken();
      await enableTotpMfa(managementApp, env, token);

      // Also enable webauthn
      await managementApp.request(
        "/guardian/factors/webauthn-roaming",
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

      // Create a confirmed passkey enrollment
      const enrollment = await env.data.authenticationMethods.create(
        "tenantId",
        {
          user_id: "email|userId",
          type: "webauthn-roaming",
          credential_id: "test-credential-id",
          public_key: "test-public-key",
          confirmed: true,
        },
      );

      // Create login session first without session_id (FK requires session to exist)
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
        state: LoginSessionState.AUTHENTICATED,
      });

      // Create the session, then link it back to the login session
      await env.data.sessions.create("tenantId", {
        id: "test-session-id",
        user_id: "email|userId",
        clients: ["clientId"],
        expires_at: new Date(Date.now() + 600000).toISOString(),
        used_at: new Date().toISOString(),
        login_session_id: loginSession.id,
        device: {
          last_ip: "",
          initial_ip: "",
          last_user_agent: "",
          initial_user_agent: "",
          initial_asn: "",
          last_asn: "",
        },
      });
      await env.data.loginSessions.update("tenantId", loginSession.id, {
        session_id: "test-session-id",
      });

      // Verify checkMfaRequired detects the passkey enrollment
      const { checkMfaRequired } =
        await import("../../../src/authentication-flows/mfa");
      const mfaCheck = await checkMfaRequired(
        { env } as any,
        "tenantId",
        "email|userId",
      );
      expect(mfaCheck.required).toBe(true);
      if (mfaCheck.required && mfaCheck.enrolled) {
        expect(mfaCheck.enrollment.type).toBe("webauthn-roaming");
        expect(mfaCheck.allEnrollments).toHaveLength(1);
      }

      // Drive the login session through createFrontChannelAuthResponse
      const { createFrontChannelAuthResponse } =
        await import("../../../src/authentication-flows/common");

      const ctx = {
        env,
        var: { tenant_id: "tenantId" },
        req: {
          header: () => {},
          queries: () => {},
        },
      } as unknown as Context<{ Bindings: Bindings; Variables: Variables }>;

      const client = await getEnrichedClient(env, "clientId");
      const user = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });
      if (!client || !user) {
        throw new Error("Client or user not found");
      }

      const response = await createFrontChannelAuthResponse(ctx, {
        authParams: loginSession.authParams,
        client,
        user,
        loginSession,
      });

      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toBe(
        `/u2/passkey/challenge?state=${encodeURIComponent(loginSession.id)}`,
      );
    });

    it("should detect multiple enrollments (TOTP + passkey) and return all", async () => {
      const { managementApp, env } = await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });

      const token = await getAdminToken();
      await enableTotpMfa(managementApp, env, token);

      // Enable webauthn
      await managementApp.request(
        "/guardian/factors/webauthn-roaming",
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

      // Create confirmed TOTP enrollment
      await env.data.authenticationMethods.create("tenantId", {
        user_id: "email|userId",
        type: "totp",
        totp_secret: "JBSWY3DPEHPK3PXP",
        confirmed: true,
      });

      // Create confirmed passkey enrollment
      await env.data.authenticationMethods.create("tenantId", {
        user_id: "email|userId",
        type: "webauthn-roaming",
        credential_id: "test-credential-id",
        public_key: "test-public-key",
        confirmed: true,
      });

      const { checkMfaRequired } =
        await import("../../../src/authentication-flows/mfa");

      const mfaCheck = await checkMfaRequired(
        { env } as any,
        "tenantId",
        "email|userId",
      );

      expect(mfaCheck.required).toBe(true);
      if (mfaCheck.required && mfaCheck.enrolled) {
        // Should return multiple enrollments, triggering login-options
        expect(mfaCheck.allEnrollments).toHaveLength(2);
        const types = mfaCheck.allEnrollments.map((e) => e.type);
        expect(types).toContain("totp");
        expect(types).toContain("webauthn-roaming");
      }
    });

    it("should show passkey in login-options when user has passkey and TOTP enrollments", async () => {
      const { managementApp, u2App, env } = await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });

      const token = await getAdminToken();
      await enableTotpMfa(managementApp, env, token);

      // Enable webauthn
      await managementApp.request(
        "/guardian/factors/webauthn-roaming",
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

      // Create confirmed TOTP enrollment
      const totpEnrollment = await env.data.authenticationMethods.create(
        "tenantId",
        {
          user_id: "email|userId",
          type: "totp",
          totp_secret: "JBSWY3DPEHPK3PXP",
          confirmed: true,
        },
      );

      // Create confirmed passkey enrollment
      const passkeyEnrollment = await env.data.authenticationMethods.create(
        "tenantId",
        {
          user_id: "email|userId",
          type: "webauthn-roaming",
          credential_id: "test-credential-id",
          public_key: "test-public-key",
          confirmed: true,
        },
      );

      const loginSession = await createMfaLoginSession(env);

      // GET the login-options screen
      const response = await u2App.request(
        `/mfa/login-options?state=${encodeURIComponent(loginSession.id)}`,
        {
          method: "GET",
          headers: { "tenant-id": "tenantId" },
        },
        env,
      );

      expect(response.status).toBe(200);
      const html = await response.text();

      // Should show both the TOTP and passkey challenge options
      expect(html).toContain(`factor_${totpEnrollment.id}`);
      expect(html).toContain(`factor_${passkeyEnrollment.id}`);

      // Should NOT show any enrollment options
      expect(html).not.toContain("factor_enroll-totp");
      expect(html).not.toContain("factor_enroll-passkey");
    });
  });
});
