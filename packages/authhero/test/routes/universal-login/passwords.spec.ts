import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import bcryptjs from "bcryptjs";
import { LogTypes, AuthorizationResponseType } from "@authhero/adapter-interfaces";
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
    expect(enterInvalidPasswordText).toContain("Invalid password");

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
        response_type: AuthorizationResponseType.CODE,
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
        response_type: AuthorizationResponseType.CODE,
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
      (log) => log.type === LogTypes.SUCCESS_CHANGE_PASSWORD_REQUEST,
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
        response_type: AuthorizationResponseType.CODE,
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
    const resetPasswordResponse = await universalClient["reset-password"].$post(
      {
        query: { state: state2, code: passwordResetCode },
        form: {
          password: "yByF#s4IO7wROi",
          "re-enter-password": "yByF#s4IO7wROi",
        },
      },
    );

    expect(resetPasswordResponse.status).toBe(200);

    // Check logs for successful password change
    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    // Look for SUCCESS_CHANGE_PASSWORD log
    const passwordResetSuccessLog = logs.find(
      (log) => log.type === LogTypes.SUCCESS_CHANGE_PASSWORD,
    );

    expect(passwordResetSuccessLog).toBeDefined();
    expect(passwordResetSuccessLog?.user_id).toBe("auth2|resetComplete456");
  });

  it("should successfully change password and allow login with new password", async () => {
    const { universalApp, oauthApp, env, getSentEmails } = await getTestServer({
      mockEmail: true,
      testTenantLanguage: "en",
    });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    const oldPassword = "OldP@ssw0rd!";
    const newPassword = "NewP@ssw0rd!";

    // Create a password user
    await env.data.users.create("tenantId", {
      email: "change-password@example.com",
      email_verified: true,
      name: "Change Password User",
      nickname: "changepass",
      connection: "Username-Password-Authentication",
      provider: "auth2",
      is_social: false,
      user_id: "auth2|changePass789",
    });

    // Add the password
    await env.data.passwords.create("tenantId", {
      user_id: "auth2|changePass789",
      password: await bcryptjs.hash(oldPassword, 10),
      algorithm: "bcrypt",
    });

    // Verify old password works initially
    const initialAuthorize = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        state: "state",
        nonce: "nonce",
        scope: "openid email profile",
        response_type: AuthorizationResponseType.CODE,
      },
    });
    const initialLocation = initialAuthorize.headers.get("location");
    const initialUrl = new URL(`https://example.com${initialLocation}`);
    const initialState = initialUrl.searchParams.get("state");
    if (!initialState) throw new Error("No state found");

    await universalClient.login.identifier.$post({
      query: { state: initialState },
      form: { username: "change-password@example.com" },
    });

    const initialLoginResponse = await universalClient["enter-password"].$post({
      query: { state: initialState },
      form: { password: oldPassword },
    });
    expect(initialLoginResponse.status).toBe(302);

    // Start password reset flow
    const authorizeResponse = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        state: "state2",
        nonce: "nonce2",
        scope: "openid email profile",
        response_type: AuthorizationResponseType.CODE,
      },
    });

    const location = authorizeResponse.headers.get("location");
    const universalUrl = new URL(`https://example.com${location}`);
    const state = universalUrl.searchParams.get("state");
    if (!state) throw new Error("No state found");

    await universalClient.login.identifier.$post({
      query: { state },
      form: { username: "change-password@example.com" },
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
    const resetState = passwordResetUrl.searchParams.get("state");

    if (!passwordResetCode || !resetState) {
      throw new Error("No code or state found in email");
    }

    // Submit new password
    const resetPasswordResponse = await universalClient["reset-password"].$post(
      {
        query: { state: resetState, code: passwordResetCode },
        form: {
          password: newPassword,
          "re-enter-password": newPassword,
        },
      },
    );

    expect(resetPasswordResponse.status).toBe(200);

    // Verify the password record was updated
    const currentPassword = await env.data.passwords.get(
      "tenantId",
      "auth2|changePass789",
    );
    expect(currentPassword).toBeDefined();
    expect(currentPassword?.is_current).toBe(true);

    // Verify new password works
    const newAuthorize = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        state: "state3",
        nonce: "nonce3",
        scope: "openid email profile",
        response_type: AuthorizationResponseType.CODE,
      },
    });
    const newLocation = newAuthorize.headers.get("location");
    const newUrl = new URL(`https://example.com${newLocation}`);
    const newState = newUrl.searchParams.get("state");
    if (!newState) throw new Error("No state found");

    await universalClient.login.identifier.$post({
      query: { state: newState },
      form: { username: "change-password@example.com" },
    });

    const newPasswordLoginResponse = await universalClient[
      "enter-password"
    ].$post({
      query: { state: newState },
      form: { password: newPassword },
    });
    expect(newPasswordLoginResponse.status).toBe(302);

    // Verify old password no longer works
    const oldAuthorize = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        state: "state4",
        nonce: "nonce4",
        scope: "openid email profile",
        response_type: AuthorizationResponseType.CODE,
      },
    });
    const oldLocation = oldAuthorize.headers.get("location");
    const oldUrl = new URL(`https://example.com${oldLocation}`);
    const oldState = oldUrl.searchParams.get("state");
    if (!oldState) throw new Error("No state found");

    await universalClient.login.identifier.$post({
      query: { state: oldState },
      form: { username: "change-password@example.com" },
    });

    const oldPasswordLoginResponse = await universalClient[
      "enter-password"
    ].$post({
      query: { state: oldState },
      form: { password: oldPassword },
    });
    expect(oldPasswordLoginResponse.status).toBe(400);
  });

  it("should reject weak passwords during reset", async () => {
    const { universalApp, oauthApp, env, getSentEmails } = await getTestServer({
      mockEmail: true,
      testTenantLanguage: "en",
    });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    // Create a password user
    await env.data.users.create("tenantId", {
      email: "weak-password@example.com",
      email_verified: true,
      name: "Weak Password User",
      nickname: "weakpass",
      connection: "Username-Password-Authentication",
      provider: "auth2",
      is_social: false,
      user_id: "auth2|weakPass123",
    });

    // Add the password
    await env.data.passwords.create("tenantId", {
      user_id: "auth2|weakPass123",
      password: await bcryptjs.hash("OldP@ssw0rd!", 10),
      algorithm: "bcrypt",
    });

    // Start password reset flow
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

    const location = authorizeResponse.headers.get("location");
    const universalUrl = new URL(`https://example.com${location}`);
    const state = universalUrl.searchParams.get("state");
    if (!state) throw new Error("No state found");

    await universalClient.login.identifier.$post({
      query: { state },
      form: { username: "weak-password@example.com" },
    });

    await universalClient["forgot-password"].$post({
      query: { state },
    });

    const sentEmails = getSentEmails();
    const passwordResetEmail = sentEmails[sentEmails.length - 1];

    if (passwordResetEmail.data.passwordResetUrl === undefined) {
      throw new Error("No reset URL found in email");
    }

    const passwordResetUrl = new URL(passwordResetEmail.data.passwordResetUrl);
    const passwordResetCode = passwordResetUrl.searchParams.get("code");
    const resetState = passwordResetUrl.searchParams.get("state");

    if (!passwordResetCode || !resetState) {
      throw new Error("No code or state found in email");
    }

    // Try to set a weak password (too short)
    const weakPasswordResponse1 = await universalClient["reset-password"].$post(
      {
        query: { state: resetState, code: passwordResetCode },
        form: {
          password: "short",
          "re-enter-password": "short",
        },
      },
    );
    expect(weakPasswordResponse1.status).toBe(400);
    const weakPasswordText1 = await weakPasswordResponse1.text();
    expect(weakPasswordText1).toContain("at least 8 characters");

    // Try to set a password without uppercase
    const weakPasswordResponse2 = await universalClient["reset-password"].$post(
      {
        query: { state: resetState, code: passwordResetCode },
        form: {
          password: "lowercase123!",
          "re-enter-password": "lowercase123!",
        },
      },
    );
    expect(weakPasswordResponse2.status).toBe(400);
    const weakPasswordText2 = await weakPasswordResponse2.text();
    expect(weakPasswordText2).toContain("uppercase letter");
  });

  it("should use connection password policy by strategy lookup, not by name", async () => {
    // This test verifies the fix for the bug where reset-password would use default
    // password policy instead of the actual connection's policy.
    //
    // The bug occurred because:
    // 1. Users are created with connection: "Username-Password-Authentication" (hardcoded)
    // 2. But the actual connection might have name: "auth2" with strategy: "Username-Password-Authentication"
    // 3. getPasswordPolicy looked up by connection NAME, not finding the connection
    // 4. This caused default policy (8 chars, uppercase, etc.) to be applied instead
    //
    // The fix: Look up connection by STRATEGY first, then use that connection's policy

    const { universalApp, oauthApp, env, getSentEmails } = await getTestServer({
      mockEmail: true,
      testTenantLanguage: "en",
    });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    // Delete the default Username-Password-Authentication connection
    await env.data.connections.remove("tenantId", "Username-Password-Authentication");

    // Create a connection with a DIFFERENT name but same strategy, with lenient password policy
    await env.data.connections.create("tenantId", {
      id: "custom-pwd-conn",
      name: "auth2", // Different name than "Username-Password-Authentication"
      strategy: "Username-Password-Authentication", // But same strategy
      options: {
        passwordPolicy: "none", // No complexity requirements
        password_complexity_options: {
          min_length: 6, // Lower than default 8
        },
      },
    });

    // Create a user with connection "Username-Password-Authentication" (mimicking the bug scenario)
    // In real code, users often get created with this hardcoded value
    await env.data.users.create("tenantId", {
      email: "policy-test@example.com",
      email_verified: true,
      name: "Policy Test User",
      nickname: "policytest",
      connection: "Username-Password-Authentication", // This doesn't match connection name "auth2"
      provider: "auth2",
      is_social: false,
      user_id: "auth2|policyTest123",
    });

    // Add a password
    await env.data.passwords.create("tenantId", {
      user_id: "auth2|policyTest123",
      password: await bcryptjs.hash("OldP@ss123!", 10),
      algorithm: "bcrypt",
    });

    // Start password reset flow
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

    const location = authorizeResponse.headers.get("location");
    const universalUrl = new URL(`https://example.com${location}`);
    const state = universalUrl.searchParams.get("state");
    if (!state) throw new Error("No state found");

    await universalClient.login.identifier.$post({
      query: { state },
      form: { username: "policy-test@example.com" },
    });

    await universalClient["forgot-password"].$post({
      query: { state },
    });

    const sentEmails = getSentEmails();
    const passwordResetEmail = sentEmails[sentEmails.length - 1];

    if (passwordResetEmail.data.passwordResetUrl === undefined) {
      throw new Error("No reset URL found in email");
    }

    const passwordResetUrl = new URL(passwordResetEmail.data.passwordResetUrl);
    const passwordResetCode = passwordResetUrl.searchParams.get("code");
    const resetState = passwordResetUrl.searchParams.get("state");

    if (!passwordResetCode || !resetState) {
      throw new Error("No code or state found in email");
    }

    // This simple password should PASS because the connection has:
    // - passwordPolicy: "none" (no complexity requirements)
    // - min_length: 6
    //
    // If the bug is present (looking up by user.connection name instead of by strategy),
    // this would FAIL because default policy requires 8 chars + uppercase + lowercase + number + special
    const simplePasswordResponse = await universalClient["reset-password"].$post(
      {
        query: { state: resetState, code: passwordResetCode },
        form: {
          password: "simple", // 6 chars, no complexity - should pass with policy "none"
          "re-enter-password": "simple",
        },
      },
    );

    // If this assertion fails with status 400, the bug is back!
    // The error message would say something like "at least 8 characters" or "uppercase letter"
    expect(simplePasswordResponse.status).toBe(200);
    const responseText = await simplePasswordResponse.text();
    expect(responseText).toContain("password has been reset");

    // Verify the new password works
    const authorizeResponse2 = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        state: "state2",
        nonce: "nonce2",
        scope: "openid email profile",
        response_type: AuthorizationResponseType.CODE,
      },
    });

    const location2 = authorizeResponse2.headers.get("location");
    const universalUrl2 = new URL(`https://example.com${location2}`);
    const state2 = universalUrl2.searchParams.get("state");
    if (!state2) throw new Error("No state found");

    await universalClient.login.identifier.$post({
      query: { state: state2 },
      form: { username: "policy-test@example.com" },
    });

    const loginWithNewPassword = await universalClient["enter-password"].$post({
      query: { state: state2 },
      form: { password: "simple" },
    });

    expect(loginWithNewPassword.status).toBe(302);
  });
});

