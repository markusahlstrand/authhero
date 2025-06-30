import { describe, expect, it } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { getAdminToken } from "../../helpers/token";
import {
  AuthorizationResponseType,
  TokenResponse,
} from "@authhero/adapter-interfaces";

describe("passwordless", async () => {
  describe("email", () => {
    it("should login using a passwordless code", async () => {
      const { oauthApp, managementApp, env, getSentEmails } =
        await getTestServer({
          testTenantLanguage: "en",
        });
      const oauthClient = testClient(oauthApp, env);
      const managementClient = testClient(managementApp, env);

      const token = await getAdminToken();
      // Add the mock client
      await managementClient.email.providers.$post(
        {
          header: {
            "tenant-id": "tenantId",
          },
          json: {
            name: "mock-email",
            credentials: {
              api_key: "apiKey",
            },
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      // --------------------------------
      // start universal auth session where response_type is code
      // --------------------------------
      const response = await oauthClient.passwordless.start.$post(
        {
          json: {
            client_id: "clientId",
            connection: "email",
            email: "foo@example.com",
            send: "code",
            authParams: {},
          },
        },
        {
          headers: {
            "x-real-ip": "1.2.3.4",
            "user-agent": "Mozilla/5.0",
          },
        },
      );

      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toBe("OK");

      const emails = await getSentEmails();
      expect(emails.length).toBe(1);
      const code = emails[0]?.data.code;
      if (!code) {
        throw new Error("No code found in email");
      }

      // --------------------------------
      // fail login with the wrong IP
      // --------------------------------
      const wrongIpResponse =
        await oauthClient.passwordless.verify_redirect.$get(
          {
            query: {
              response_type: AuthorizationResponseType.CODE,
              redirect_uri: "https://example.com/callback",
              client_id: "clientId",
              email: "foo@example.com",
              verification_code: code,
              connection: "email",
              state: "state",
              scope: "openid",
              audience: "https://example.com",
            },
          },
          {
            headers: {
              "x-real-ip": "2.2.2.2",
            },
          },
        );

      expect(wrongIpResponse.status).toBe(302);
      const wrongIpLocation = new URL(wrongIpResponse.headers.get("location")!);

      expect(wrongIpLocation.pathname).toBe("/u/invalid-session");
      const loginSessionId = wrongIpLocation.searchParams.get("state");
      expect(loginSessionId).toBeTypeOf("string");
      const wrongIpLoginSession = await env.data.loginSessions.get(
        "tenantId",
        loginSessionId!,
      );
      expect(wrongIpLoginSession).toBeTruthy();

      // --------------------------------
      // login using the code
      // --------------------------------
      const loginResponse = await oauthClient.passwordless.verify_redirect.$get(
        {
          query: {
            response_type: AuthorizationResponseType.CODE,
            redirect_uri: "https://example.com/callback",
            client_id: "clientId",
            email: "foo@example.com",
            verification_code: code,
            connection: "email",
            state: "state",
            scope: "openid",
            audience: "https://example.com",
          },
        },
        {
          headers: {
            "x-real-ip": "1.2.3.4",
          },
        },
      );

      expect(loginResponse.status).toBe(302);
      const location = loginResponse.headers.get("location");
      if (!location) {
        throw new Error("No location header found");
      }
      const redirectUrl = new URL(location);
      expect(redirectUrl.pathname).toBe("/callback");
      expect(redirectUrl.searchParams.get("code")).toBeTruthy();
    });
  });

  describe("sms", () => {
    it.only("should login using a passwordless code", async () => {
      const { oauthApp, managementApp, env, getSentSms } = await getTestServer({
        testTenantLanguage: "en",
      });
      const oauthClient = testClient(oauthApp, env);
      const managementClient = testClient(managementApp, env);

      const token = await getAdminToken();

      // Add SMS connection
      await managementClient.connections.$post(
        {
          header: {
            "tenant-id": "tenantId",
          },
          json: {
            name: "sms",
            strategy: "sms",
            options: {
              provider: "twilio",
              from: "+1234567890",
              twilio_sid: "mock_account_sid",
              twilio_token: "mock_auth_token",
            },
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      // --------------------------------
      // start universal auth session where response_type is code
      // --------------------------------
      const response = await oauthClient.passwordless.start.$post(
        {
          json: {
            client_id: "clientId",
            connection: "sms",
            phone_number: "+46707123456",
            send: "code",
            authParams: {},
          },
        },
        {
          headers: {
            "x-real-ip": "1.2.3.4",
            "user-agent": "Mozilla/5.0",
          },
        },
      );

      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toBe("OK");

      const sms = await getSentSms();
      expect(sms.length).toBe(1);
      const code = sms[0]?.data.code;
      if (!code) {
        throw new Error("No code found in sms");
      }

      // --------------------------------
      // login using the token endpoint
      // --------------------------------
      const loginResponse = await oauthClient.oauth.token.$post(
        {
          form: {
            grant_type: "http://auth0.com/oauth/grant-type/passwordless/otp",
            otp: code,
            client_id: "clientId",
            realm: "sms",
            username: "+46707123456",
          },
        },
        {
          headers: {
            "tenant-id": "tenantId",
          },
        },
      );

      expect(loginResponse.status).toBe(200);
      const loginResponseBody = (await loginResponse.json()) as TokenResponse;

      expect(loginResponseBody.access_token).toBeTypeOf("string");
      expect(loginResponseBody.token_type).toBe("Bearer");
    });
  });
});
