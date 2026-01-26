import { describe, it, expect, vi } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";

describe("login identifier page", () => {
  it("should return an invalid email error when entering an invalid email", async () => {
    const { universalApp, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    // Start OAuth authorization flow
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
    // GET identifier page
    // --------------------------------
    const identifierGetResponse = await universalClient.login.identifier.$get({
      query: { state },
    });
    expect(identifierGetResponse.status).toBe(200);

    // --------------------------------
    // POST invalid email to identifier page
    // --------------------------------
    const invalidEmailResponse = await universalClient.login.identifier.$post({
      query: { state },
      form: { username: "invalid-email" },
    });

    expect(invalidEmailResponse.status).toBe(400);

    const invalidEmailBody = await invalidEmailResponse.text();

    // Check that the error message is displayed in the HTML
    expect(invalidEmailBody).toContain("Invalid identifier");

    // Verify that it's still the identifier page (contains the form)
    expect(invalidEmailBody).toContain("username");
    expect(invalidEmailBody).toContain("input");

    // Verify the invalid email value is preserved in the form
    expect(invalidEmailBody).toContain("invalid-email");
  });

  it("should return an invalid email error for malformed email addresses", async () => {
    const { universalApp, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    // Start OAuth authorization flow
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

    // Test various malformed email addresses
    const invalidEmails = [
      "test@",
      "@example.com",
      "test@.com",
      "test.example.com",
      "test@@example.com",
      "",
      " ",
      "test@example",
    ];

    for (const invalidEmail of invalidEmails) {
      const invalidEmailResponse = await universalClient.login.identifier.$post(
        {
          query: { state },
          form: { username: invalidEmail },
        },
      );

      expect(invalidEmailResponse.status).toBe(400);

      const invalidEmailBody = await invalidEmailResponse.text();

      // Check that the error message is displayed in the HTML
      expect(invalidEmailBody).toContain("Invalid identifier");

      // Verify that it's still the identifier page (contains the form)
      expect(invalidEmailBody).toContain("username");
      expect(invalidEmailBody).toContain("input");
    }
  });

  it("should successfully process valid email addresses", async () => {
    const { universalApp, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    // Start OAuth authorization flow
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
    // POST valid email to identifier page
    // --------------------------------
    const validEmailResponse = await universalClient.login.identifier.$post({
      query: { state },
      form: { username: "test@example.com" },
    });

    // Should redirect (status 302) on valid email, not return 400
    expect(validEmailResponse.status).toBe(302);

    // Should redirect to enter-code page for email authentication
    const redirectLocation = validEmailResponse.headers.get("location");
    expect(redirectLocation).toContain("/u/enter-code");
  });

  it("should call validateSignupEmail hook when user doesn't exist", async () => {
    const validateSignupEmailSpy = vi.fn(async () => {
      // Hook allows signup by not calling api.deny()
    });

    const { universalApp, oauthApp, env } = await getTestServer({
      mockEmail: true,
      hooks: {
        onExecuteValidateRegistrationUsername: validateSignupEmailSpy,
      },
    });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    // Start OAuth authorization flow
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

    // POST new email (user doesn't exist) to identifier page
    const newUserResponse = await universalClient.login.identifier.$post({
      query: { state },
      form: { username: "newuser@example.com" },
    });

    // Should call the validateSignupEmail hook
    expect(validateSignupEmailSpy).toHaveBeenCalledTimes(1);
    expect(validateSignupEmailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({
          email: "newuser@example.com",
        }),
        client: expect.objectContaining({
          client_id: "clientId",
        }),
        request: expect.objectContaining({
          method: "POST",
        }),
      }),
      expect.objectContaining({
        deny: expect.any(Function),
        token: expect.any(Object),
      }),
    );

    // Should succeed and redirect
    expect(newUserResponse.status).toBe(302);
  });

  it("should block signup when validateSignupEmail hook denies", async () => {
    const validateSignupEmailSpy = vi.fn(async (_event, api) => {
      api.deny("Signups not allowed from this domain");
    });

    const { universalApp, oauthApp, env } = await getTestServer({
      mockEmail: true,
      hooks: {
        onExecuteValidateRegistrationUsername: validateSignupEmailSpy,
      },
    });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    // Start OAuth authorization flow
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

    // POST new email to identifier page
    const blockedResponse = await universalClient.login.identifier.$post({
      query: { state },
      form: { username: "blocked@example.com" },
    });

    // Should call the hook
    expect(validateSignupEmailSpy).toHaveBeenCalledTimes(1);

    // Should return 400 with error message
    expect(blockedResponse.status).toBe(400);
    const body = await blockedResponse.text();
    expect(body).toContain("User account does not exist");
  });

  it("should not call validateSignupEmail hook when user exists", async () => {
    const validateSignupEmailSpy = vi.fn(async () => {
      // Hook allows signup by not calling api.deny()
    });

    const { universalApp, oauthApp, env } = await getTestServer({
      mockEmail: true,
      hooks: {
        onExecuteValidateRegistrationUsername: validateSignupEmailSpy,
      },
    });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    // Create a user first
    await env.data.users.create("tenantId", {
      user_id: "auth2|existinguser",
      email: "existing@example.com",
      email_verified: true,
      provider: "email",
      connection: "email",
      is_social: false,
    });

    // Start OAuth authorization flow
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

    // POST existing user's email to identifier page
    const existingUserResponse = await universalClient.login.identifier.$post({
      query: { state },
      form: { username: "existing@example.com" },
    });

    // Should NOT call the validateSignupEmail hook for existing users
    expect(validateSignupEmailSpy).not.toHaveBeenCalled();

    // Should succeed and redirect
    expect(existingUserResponse.status).toBe(302);
  });

  it("should redirect to enter-password page when user has password strategy (auth2 provider)", async () => {
    const { universalApp, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    // Create a user with password strategy (auth2 provider, not email provider)
    // This tests the bug where getPrimaryUserByProvider couldn't find the user
    // because it was looking for provider="email" but user had provider="auth2"
    await env.data.users.create("tenantId", {
      user_id: "auth2|passworduser",
      email: "password@example.com",
      email_verified: true,
      provider: "auth2",
      connection: "Username-Password-Authentication",
      is_social: false,
      app_metadata: {
        strategy: "Username-Password-Authentication",
      },
    });

    // Start OAuth authorization flow
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
    // POST email to identifier page
    // --------------------------------
    const passwordUserResponse = await universalClient.login.identifier.$post({
      query: { state },
      form: { username: "password@example.com" },
    });

    // Should redirect to enter-password page
    expect(passwordUserResponse.status).toBe(302);
    const redirectLocation = passwordUserResponse.headers.get("location");
    expect(redirectLocation).toContain("/u/enter-password");
  });
});
