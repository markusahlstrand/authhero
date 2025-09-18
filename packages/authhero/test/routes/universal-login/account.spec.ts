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
    const changeEmailResponse = await universalClient["account"]["change-email"].$post(
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
    expect(changeEmailPageContent).toContain("Verifiera konto");

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
    expect(confirmationPageContent).toContain("Klart");

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
});
