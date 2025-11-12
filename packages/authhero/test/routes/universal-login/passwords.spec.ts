import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import bcryptjs from "bcryptjs";
import { LogTypes } from "@authhero/adapter-interfaces";
import { getTestServer } from "../../helpers/test-server";

describe("passwords", () => {
  it("should login using a password", async () => {
    const { universalApp, oauthApp, env, getSentEmails } = await getTestServer({
      mockEmail: true,
      testTenantLanguage: "en",
    });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    // Create a password user
    await env.data.users.create("tenantId", {
      email: "foo2@example.com",
      email_verified: true,
      name: "Test User",
      nickname: "Test User",
      picture: "https://example.com/test.png",
      connection: "Username-Password-Authentication",
      provider: "auth2",
      is_social: false,
      user_id: "auth2|userId",
    });

    // Add the password
    await env.data.passwords.create("tenantId", {
      user_id: "auth2|userId",
      password: await bcryptjs.hash("password", 10),
      algorithm: "bcrypt",
    });

    const authorizeResponse = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        state: "state",
        nonce: "nonce",
        scope: "openid email profile",
      },
    });

    expect(authorizeResponse.status).toBe(302);

    const location = authorizeResponse.headers.get("location");
    const universalUrl = new URL(`https://example.com${location}`);
    const state = universalUrl.searchParams.get("state");
    if (!state) {
      throw new Error("No state found");
    }

    // --------------------------------
    // enter email
    // --------------------------------
    const enterEmailGetResponse = await universalClient.login.identifier.$get({
      query: { state },
    });
    expect(enterEmailGetResponse.status).toBe(200);

    const enterEmailPostResponse = await universalClient.login.identifier.$post(
      {
        query: { state },
        form: { username: "foo2@example.com" },
      },
    );
    expect(enterEmailPostResponse.status).toBe(302);

    // --------------------------------
    // enter invalid password
    // --------------------------------
    const enterPasswordGetResponse = await universalClient[
      "enter-password"
    ].$get({
      query: { state },
    });
    expect(enterPasswordGetResponse.status).toBe(200);

    const enterInvalidPasswordPostResponse = await universalClient[
      "enter-password"
    ].$post({
      query: { state },
      form: { password: "invalid-password" },
    });

    expect(enterInvalidPasswordPostResponse.status).toBe(400);
    const enterInvalidPasswordText =
      await enterInvalidPasswordPostResponse.text();
    expect(enterInvalidPasswordText).toContain("Ogiltigt lösenord");

    // --------------------------------
    // enter password
    // --------------------------------
    const enterPasswordPostResponse = await universalClient[
      "enter-password"
    ].$post({
      query: { state },
      form: { password: "password" },
    });

    expect(enterPasswordPostResponse.status).toBe(302);
    const enterCodeLocation = enterPasswordPostResponse.headers.get("location");
    if (!enterCodeLocation) {
      throw new Error("No location header found");
    }

    const redirectUri = new URL(enterCodeLocation);
    expect(redirectUri.pathname).toEqual("/callback");
    expect(redirectUri.searchParams.get("code")).toBeTypeOf("string");
    expect(redirectUri.searchParams.get("state")).toBe("state");

    const user = await env.data.users.get("tenantId", "auth2|userId");
    if (!user) {
      throw new Error("User not found");
    }
    expect(user.app_metadata.strategy).toBe("Username-Password-Authentication");

    // --------------------------------
    // request password reset
    // --------------------------------

    const authorizeResponse2 = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        state: "state",
        nonce: "nonce",
        scope: "openid email profile",
      },
    });

    expect(authorizeResponse2.status).toBe(302);

    const location2 = authorizeResponse2.headers.get("location");
    const universalUrl2 = new URL(`https://example.com${location2}`);
    const state2 = universalUrl2.searchParams.get("state");
    if (!state2) {
      throw new Error("No state found");
    }

    await universalClient.login.identifier.$post({
      query: { state: state2 },
      form: { username: "foo2@example.com" },
    });

    const forgotPasswordResponse = await universalClient[
      "forgot-password"
    ].$post({
      query: { state: state2 },
    });

    expect(forgotPasswordResponse.status).toBe(200);

    const sentEmails = getSentEmails();
    expect(sentEmails.length).toBe(2);

    const passwordResetEmail = sentEmails[1];

    if (passwordResetEmail.data.passwordResetUrl === undefined) {
      throw new Error("No code found in email");
    }
    const passwordResetUrl = new URL(passwordResetEmail.data.passwordResetUrl);
    const passwordResetCode = passwordResetUrl.searchParams.get("code");
    if (!passwordResetCode) {
      throw new Error("No code found in email");
    }

    // --------------------------------
    // enter new password
    // --------------------------------

    const resetPasswordGetResponse = await universalClient[
      "reset-password"
    ].$post({
      query: { state: state2, code: passwordResetCode },
      form: {
        password: "yByF#s4IO7wROi",
        "re-enter-password": "yByF#s4IO7wROi",
      },
    });

    expect(resetPasswordGetResponse.status).toBe(200);
  });

  it("should log password reset request when email is sent", async () => {
    const { universalApp, oauthApp, env, getSentEmails } = await getTestServer({
      mockEmail: true,
      testTenantLanguage: "en",
    });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    // Create a password user
    await env.data.users.create("tenantId", {
      email: "reset-log@example.com",
      email_verified: true,
      name: "Reset Log User",
      nickname: "resetlog",
      connection: "Username-Password-Authentication",
      provider: "auth2",
      is_social: false,
      user_id: "auth2|resetLog123",
    });

    // Add the password
    await env.data.passwords.create("tenantId", {
      user_id: "auth2|resetLog123",
      password: await bcryptjs.hash("password", 10),
      algorithm: "bcrypt",
    });

    // Start authorization flow
    const authorizeResponse = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        state: "state",
        nonce: "nonce",
        scope: "openid email profile",
      },
    });

    const location = authorizeResponse.headers.get("location");
    const universalUrl = new URL(`https://example.com${location}`);
    const state = universalUrl.searchParams.get("state");
    if (!state) throw new Error("No state found");

    // Enter email
    await universalClient.login.identifier.$post({
      query: { state },
      form: { username: "reset-log@example.com" },
    });

    // Request password reset
    const forgotPasswordResponse = await universalClient[
      "forgot-password"
    ].$post({
      query: { state },
    });

    expect(forgotPasswordResponse.status).toBe(200);

    // Check logs for password reset request
    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    // Look for SUCCESS_CHANGE_PASSWORD_REQUEST log
    const passwordResetRequestLog = logs.find(
      (log) => log.type === LogTypes.SUCCESS_CHANGE_PASSWORD_REQUEST
    );

    expect(passwordResetRequestLog).toBeDefined();
    expect(passwordResetRequestLog?.description).toBe("reset-log@example.com");
  });

  it("should log successful password change when password reset is completed", async () => {
    const { universalApp, oauthApp, env, getSentEmails } = await getTestServer({
      mockEmail: true,
      testTenantLanguage: "en",
    });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    // Create a password user
    await env.data.users.create("tenantId", {
      email: "reset-complete@example.com",
      email_verified: true,
      name: "Reset Complete User",
      nickname: "resetcomplete",
      connection: "Username-Password-Authentication",
      provider: "auth2",
      is_social: false,
      user_id: "auth2|resetComplete456",
    });

    // Add the password
    await env.data.passwords.create("tenantId", {
      user_id: "auth2|resetComplete456",
      password: await bcryptjs.hash("password", 10),
      algorithm: "bcrypt",
    });

    // Start authorization flow
    const authorizeResponse = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        state: "state",
        nonce: "nonce",
        scope: "openid email profile",
      },
    });

    const location = authorizeResponse.headers.get("location");
    const universalUrl = new URL(`https://example.com${location}`);
    const state = universalUrl.searchParams.get("state");
    if (!state) throw new Error("No state found");

    // Enter email
    await universalClient.login.identifier.$post({
      query: { state },
      form: { username: "reset-complete@example.com" },
    });

    // Request password reset
    await universalClient["forgot-password"].$post({
      query: { state },
    });

    // Get the password reset email
    const sentEmails = getSentEmails();
    const passwordResetEmail = sentEmails[sentEmails.length - 1];

    if (passwordResetEmail.data.passwordResetUrl === undefined) {
      throw new Error("No reset URL found in email");
    }

    const passwordResetUrl = new URL(passwordResetEmail.data.passwordResetUrl);
    const passwordResetCode = passwordResetUrl.searchParams.get("code");
    const state2 = passwordResetUrl.searchParams.get("state");

    if (!passwordResetCode || !state2) {
      throw new Error("No code or state found in email");
    }

    // Submit new password
    const resetPasswordResponse = await universalClient[
      "reset-password"
    ].$post({
      query: { state: state2, code: passwordResetCode },
      form: {
        password: "yByF#s4IO7wROi",
        "re-enter-password": "yByF#s4IO7wROi",
      },
    });

    expect(resetPasswordResponse.status).toBe(200);

    // Check logs for successful password change
    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    // Look for SUCCESS_CHANGE_PASSWORD log
    const passwordResetSuccessLog = logs.find(
      (log) => log.type === LogTypes.SUCCESS_CHANGE_PASSWORD
    );

    expect(passwordResetSuccessLog).toBeDefined();
    expect(passwordResetSuccessLog?.user_id).toBe("auth2|resetComplete456");
  });
});
