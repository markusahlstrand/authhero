import { describe, expect, it } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import {
  AuthorizationResponseType,
  LoginSessionState,
} from "@authhero/adapter-interfaces";
import { nanoid } from "nanoid";

describe("passwordless auth_connection", () => {
  it("should set auth_connection on the login session after email OTP login", async () => {
    const { oauthApp, env, getSentEmails } = await getTestServer({
      testTenantLanguage: "en",
    });
    const oauthClient = testClient(oauthApp, env);

    // Start passwordless flow
    const startResponse = await oauthClient.passwordless.start.$post(
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
    expect(startResponse.status).toBe(200);

    // Get the OTP code from the sent email
    const emails = await getSentEmails();
    expect(emails.length).toBe(1);
    const code = emails[0]?.data.code;
    if (!code) {
      throw new Error("No code found in email");
    }

    // Verify the code via redirect — this triggers the full auth flow:
    // authenticateLoginSession (PENDING→AUTHENTICATED) then
    // completeLoginSession (AUTHENTICATED→COMPLETED) with auth_connection
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

    // Extract the authorization code from the redirect
    const redirectUrl = new URL(location);
    const authCode = redirectUrl.searchParams.get("code");
    expect(authCode).toBeTruthy();

    // Look up the code to find the login session ID
    const codeRecord = await env.data.codes.get(
      "tenantId",
      authCode!,
      "authorization_code",
    );
    expect(codeRecord).toBeTruthy();
    const loginSessionId = codeRecord!.login_id;

    // Verify the login session has auth_connection set after completion
    const loginSession = await env.data.loginSessions.get(
      "tenantId",
      loginSessionId,
    );
    expect(loginSession).toBeTruthy();
    expect(loginSession!.state).toBe(LoginSessionState.COMPLETED);
    expect(loginSession!.auth_connection).toBe("email");
  });

  it("should set auth_connection to the linked identity's connection, not the primary user's", async () => {
    const { oauthApp, env, getSentEmails } = await getTestServer({
      testTenantLanguage: "en",
    });
    const oauthClient = testClient(oauthApp, env);

    // Create a social/OIDC user (primary) with a different connection
    const primaryUserId = `google-oauth2|${nanoid()}`;
    await env.data.users.create("tenantId", {
      user_id: primaryUserId,
      email: "linked@example.com",
      email_verified: true,
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
      login_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Create an email user (secondary) linked to the social user
    const linkedUserId = `email|${nanoid()}`;
    await env.data.users.create("tenantId", {
      user_id: linkedUserId,
      email: "linked@example.com",
      email_verified: true,
      provider: "email",
      connection: "email",
      is_social: false,
      login_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      linked_to: primaryUserId,
    });

    // Create a google-oauth2 connection
    await env.data.connections.create("tenantId", {
      id: "google-oauth2",
      name: "google-oauth2",
      strategy: "google-oauth2",
      options: {},
    });

    // Start passwordless flow for the linked email user
    const startResponse = await oauthClient.passwordless.start.$post(
      {
        json: {
          client_id: "clientId",
          connection: "email",
          email: "linked@example.com",
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
    expect(startResponse.status).toBe(200);

    // Get the OTP code from the sent email
    const emails = await getSentEmails();
    expect(emails.length).toBe(1);
    const code = emails[0]?.data.code;
    if (!code) {
      throw new Error("No code found in email");
    }

    // Verify the code — the user will be resolved to the primary (google-oauth2) user
    // but auth_connection should still be "email" since that's the connection used
    const loginResponse = await oauthClient.passwordless.verify_redirect.$get(
      {
        query: {
          response_type: AuthorizationResponseType.CODE,
          redirect_uri: "https://example.com/callback",
          client_id: "clientId",
          email: "linked@example.com",
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
    const authCode = redirectUrl.searchParams.get("code");
    expect(authCode).toBeTruthy();

    // Look up the code to find the login session ID
    const codeRecord = await env.data.codes.get(
      "tenantId",
      authCode!,
      "authorization_code",
    );
    expect(codeRecord).toBeTruthy();
    const loginSessionId = codeRecord!.login_id;

    // CRITICAL: auth_connection should be "email" (the connection used to authenticate),
    // NOT "google-oauth2" (the primary user's connection)
    const loginSession = await env.data.loginSessions.get(
      "tenantId",
      loginSessionId,
    );
    expect(loginSession).toBeTruthy();
    expect(loginSession!.state).toBe(LoginSessionState.COMPLETED);
    expect(loginSession!.auth_connection).toBe("email");
  });
});
