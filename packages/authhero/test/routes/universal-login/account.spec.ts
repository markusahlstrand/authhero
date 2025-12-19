import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { loginWithCode } from "../../helpers/login";
import {
  LogTypes,
  AuthorizationResponseType,
  AuthorizationResponseMode,
} from "@authhero/adapter-interfaces";

describe("account", () => {
  it("should send verification code and redirect to change-email page, then update email after code verification", async () => {
    const testServer = await getTestServer({
      mockEmail: true,
    });

    const { universalApp, env, getSentEmails } = testServer;
    const universalClient = testClient(universalApp, env);

    const { cookieName, cookieValue, state } = await loginWithCode(testServer, {
      redirect_uri: "http://localhost:3000/u/account",
    });

    // ---------------------------------
    // Request email change
    // ---------------------------------
    const changeEmailResponse = await universalClient["account"][
      "change-email"
    ].$post(
      {
        query: { state },
        form: {
          email: "new@example.com",
        },
      },
      {
        headers: {
          cookie: `${cookieName}=${cookieValue}`,
        },
      },
    );

    // Should redirect to change-email page
    expect(changeEmailResponse.status).toBe(302);
    const location = changeEmailResponse.headers.get("location");
    expect(location).toContain("/u/account/change-email-verify");
    expect(location).toContain("email=new%40example.com");
    expect(location).toContain("state=");
    expect(location).toContain("change_id=");

    // Extract change_id from location
    const url = new URL(location!, "http://localhost:3000");
    const changeId = url.searchParams.get("change_id");
    expect(changeId).toBeDefined();

    // Should have sent verification code email
    const sentEmails = getSentEmails();
    expect(sentEmails).toHaveLength(2); // 1 for login, 1 for email change
    const verificationEmail = sentEmails[1];
    expect(verificationEmail.to).toBe("new@example.com");
    expect(verificationEmail.data.code).toBeDefined();

    const verificationCode = verificationEmail.data.code;

    // ---------------------------------
    // Access change-email-verify page
    // ---------------------------------
    const changeEmailPageResponse = await universalClient.account[
      "change-email-verify"
    ].$get(
      {
        query: {
          state,
          email: "new@example.com",
          change_id: changeId!,
        },
      },
      {
        headers: {
          cookie: `${cookieName}=${cookieValue}`,
        },
      },
    );

    expect(changeEmailPageResponse.status).toBe(200);
    const changeEmailPageContent = await changeEmailPageResponse.text();
    expect(changeEmailPageContent).toContain("new@example.com");
    expect(changeEmailPageContent).toContain("Verify account");

    // ---------------------------------
    // Submit verification code
    // ---------------------------------
    const verifyCodeResponse = await universalClient.account[
      "change-email-verify"
    ].$post(
      {
        query: {
          state,
          email: "new@example.com",
          change_id: changeId!,
        },
        form: {
          code: verificationCode,
        },
      },
      {
        headers: {
          cookie: `${cookieName}=${cookieValue}`,
        },
      },
    );

    // Should redirect to confirmation page
    expect(verifyCodeResponse.status).toBe(302);
    const confirmationLocation = verifyCodeResponse.headers.get("location");
    expect(confirmationLocation).toContain(
      "/u/account/change-email-confirmation",
    );
    expect(confirmationLocation).toContain("state=");
    expect(confirmationLocation).toContain("email=new%40example.com");

    // ---------------------------------
    // Access confirmation page
    // ---------------------------------
    const confirmationPageResponse = await universalClient.account[
      "change-email-confirmation"
    ].$get(
      {
        query: {
          state,
          email: "new@example.com",
        },
      },
      {
        headers: {
          cookie: `${cookieName}=${cookieValue}`,
        },
      },
    );

    expect(confirmationPageResponse.status).toBe(200);
    const confirmationPageContent = await confirmationPageResponse.text();
    expect(confirmationPageContent).toContain("new@example.com");
    expect(confirmationPageContent).toContain("Success");

    // ---------------------------------
    // Verify email was updated and verified
    // ---------------------------------
    const updatedUser = await env.data.users.get("tenantId", "email|userId");
    if (!updatedUser) {
      throw new Error("User not found");
    }
    expect(updatedUser.email).toBe("new@example.com");
    expect(updatedUser.email_verified).toBe(true);

    // -----------------------------------
    // Verify that there is a log entry for the email change
    // -----------------------------------
    const { logs } = await env.data.logs.list("tenantId", {
      q: `user_id:email|userId type:${LogTypes.SUCCESS_CHANGE_EMAIL}`,
    });
    expect(logs).toHaveLength(1);
  });

  it("should redirect to login identifier when accessing /u/account without valid session", async () => {
    const testServer = await getTestServer({
      mockEmail: true,
    });

    const { universalApp, oauthApp, env } = testServer;
    const universalClient = testClient(universalApp, env);
    const oauthClient = testClient(oauthApp, env);

    // Create an authorization request to get a state
    const authorizeResponse = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        redirect_uri: "http://localhost:3000/u/account",
        state: "testState",
        nonce: "nonce",
        scope: "openid email profile",
        auth0Client: "eyJuYW1lIjoiYXV0aDAtc3BhLWpzIiwidmVyc2lvbiI6IjIuMS4zIn0=",
        response_type: AuthorizationResponseType.CODE,
        response_mode: AuthorizationResponseMode.QUERY,
      },
    });

    expect(authorizeResponse.status).toBe(302);
    const location = authorizeResponse.headers.get("location");
    const universalUrl = new URL(`http://localhost:3000${location}`);
    const state = universalUrl.searchParams.get("state");

    if (!state) {
      throw new Error("No state found");
    }

    // Try to access account page without any session cookie
    const accountResponse = await universalClient["account"].$get({
      query: { state },
    });

    expect(accountResponse.status).toBe(302);

    const redirectLocation = accountResponse.headers.get("location");
    expect(redirectLocation).toContain("/u/login/identifier");
    expect(redirectLocation).toContain(`state=${state}`);
  });

  it("should update email on linked email/password users when primary OIDC user changes email", async () => {
    const testServer = await getTestServer({
      mockEmail: true,
    });

    const { universalApp, oauthApp, env, getSentEmails } = testServer;
    const universalClient = testClient(universalApp, env);
    const oauthClient = testClient(oauthApp, env);

    const originalEmail = "oidc-user@example.com";
    const newEmail = "updated-oidc-user@example.com";

    // Create primary OIDC user
    const primaryUser = await env.data.users.create("tenantId", {
      user_id: "google-oauth2|primary-user",
      email: originalEmail,
      email_verified: true,
      name: "Primary OIDC User",
      nickname: "oidcuser",
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
    });

    // Create linked email/password user with same email
    const linkedPasswordUser = await env.data.users.create("tenantId", {
      user_id: "auth2|linked-password-user",
      email: originalEmail,
      email_verified: true,
      name: "Linked Password User",
      nickname: "passworduser",
      provider: "auth2",
      connection: "Username-Password-Authentication",
      is_social: false,
      linked_to: primaryUser.user_id,
    });

    // Create another linked email user
    const linkedEmailUser = await env.data.users.create("tenantId", {
      user_id: "email|linked-email-user",
      email: originalEmail,
      email_verified: true,
      name: "Linked Email User",
      nickname: "emailuser",
      provider: "email",
      connection: "email",
      is_social: false,
      linked_to: primaryUser.user_id,
    });

    // Verify initial state - all users have same email
    const initialPrimaryUser = await env.data.users.get(
      "tenantId",
      primaryUser.user_id,
    );
    const initialLinkedPasswordUser = await env.data.users.get(
      "tenantId",
      linkedPasswordUser.user_id,
    );
    const initialLinkedEmailUser = await env.data.users.get(
      "tenantId",
      linkedEmailUser.user_id,
    );

    expect(initialPrimaryUser?.email).toBe(originalEmail);
    expect(initialLinkedPasswordUser?.email).toBe(originalEmail);
    expect(initialLinkedEmailUser?.email).toBe(originalEmail);

    // Create an authorization request to get a state
    const authorizeResponse = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        redirect_uri: "http://localhost:3000/u/account",
        state: "testState",
        nonce: "nonce",
        scope: "openid email profile",
        auth0Client: "eyJuYW1lIjoiYXV0aDAtc3BhLWpzIiwidmVyc2lvbiI6IjIuMS4zIn0=",
        response_type: AuthorizationResponseType.CODE,
        response_mode: AuthorizationResponseMode.QUERY,
      },
    });

    expect(authorizeResponse.status).toBe(302);
    const location = authorizeResponse.headers.get("location");
    const universalUrl = new URL(`http://localhost:3000${location}`);
    const state = universalUrl.searchParams.get("state");

    if (!state) {
      throw new Error("No state found");
    }

    // Create a session for the primary OIDC user
    const session = await env.data.sessions.create("tenantId", {
      id: "oidc-session-id",
      login_session_id: state,
      user_id: primaryUser.user_id,
      clients: ["clientId"],
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      used_at: new Date().toISOString(),
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
    });

    // Update login session with session_id
    await env.data.loginSessions.update("tenantId", state, {
      session_id: session.id,
    });

    const cookieName = "tenantId-auth-token";
    const cookieValue = session.id;

    // ---------------------------------
    // Request email change on primary user
    // ---------------------------------
    const changeEmailResponse = await universalClient["account"][
      "change-email"
    ].$post(
      {
        query: { state },
        form: {
          email: newEmail,
        },
      },
      {
        headers: {
          cookie: `${cookieName}=${cookieValue}`,
        },
      },
    );

    // Should redirect to change-email-verify page
    expect(changeEmailResponse.status).toBe(302);
    const changeEmailLocation = changeEmailResponse.headers.get("location");
    expect(changeEmailLocation).toContain("/u/account/change-email-verify");

    // Extract change_id from location
    const url = new URL(changeEmailLocation!, "http://localhost:3000");
    const changeId = url.searchParams.get("change_id");
    expect(changeId).toBeDefined();

    // Get the verification code from sent emails
    const sentEmails = getSentEmails();
    const verificationEmail = sentEmails.find((e) => e.to === newEmail);
    expect(verificationEmail).toBeDefined();
    const verificationCode = verificationEmail!.data.code;

    // ---------------------------------
    // Submit verification code
    // ---------------------------------
    const verifyCodeResponse = await universalClient.account[
      "change-email-verify"
    ].$post(
      {
        query: {
          state,
          email: newEmail,
          change_id: changeId!,
        },
        form: {
          code: verificationCode,
        },
      },
      {
        headers: {
          cookie: `${cookieName}=${cookieValue}`,
        },
      },
    );

    // Should redirect to confirmation page
    expect(verifyCodeResponse.status).toBe(302);

    // ---------------------------------
    // Verify all users' emails were updated
    // ---------------------------------
    const updatedPrimaryUser = await env.data.users.get(
      "tenantId",
      primaryUser.user_id,
    );
    const updatedLinkedPasswordUser = await env.data.users.get(
      "tenantId",
      linkedPasswordUser.user_id,
    );
    const updatedLinkedEmailUser = await env.data.users.get(
      "tenantId",
      linkedEmailUser.user_id,
    );

    // Primary user's email should be updated
    expect(updatedPrimaryUser?.email).toBe(newEmail);
    expect(updatedPrimaryUser?.email_verified).toBe(true);

    // Linked email/password user's email should also be updated
    expect(updatedLinkedPasswordUser?.email).toBe(newEmail);
    expect(updatedLinkedPasswordUser?.email_verified).toBe(true);

    // Linked email user's email should also be updated
    expect(updatedLinkedEmailUser?.email).toBe(newEmail);
    expect(updatedLinkedEmailUser?.email_verified).toBe(true);
  });
});
