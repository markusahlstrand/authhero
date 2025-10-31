import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";

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
    expect(invalidEmailBody).toContain("Ogiltig identifierare");

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
      expect(invalidEmailBody).toContain("Ogiltig identifierare");

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

  it("should allow password login when user has password strategy even without password connection", async () => {
    const { universalApp, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });

    // Create a user with password strategy in app_metadata
    await env.data.users.create("tenantId", {
      user_id: "email|userWithPassword",
      email: "user@example.com",
      name: "Test User",
      provider: "email",
      connection: "email",
      email_verified: false,
      is_social: false,
      login_count: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      app_metadata: {
        strategy: "Username-Password-Authentication",
      },
    });

    // Create a client WITHOUT password connection (only email connection)
    // Note: The test server already creates an email connection, so we just create a new client
    await env.data.clients.create("tenantId", {
      client_id: "clientWithOnlyEmail",
      name: "Test Client Without Password",
      callbacks: ["https://example.com/callback"],
      allowed_logout_urls: ["https://example.com/callback"],
      web_origins: ["https://example.com"],
    });

    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    // Start OAuth authorization flow with client that has no password connection
    const authorizeResponse = await oauthClient.authorize.$get({
      query: {
        client_id: "clientWithOnlyEmail",
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
    // POST email of user with password strategy
    // --------------------------------
    const identifierResponse = await universalClient.login.identifier.$post({
      query: { state },
      form: { username: "user@example.com" },
    });

    // Should redirect to password page even without password connection on the client
    // because the user has app_metadata.strategy set to "Username-Password-Authentication"
    expect(identifierResponse.status).toBe(302);
    const redirectLocation = identifierResponse.headers.get("location");
    expect(redirectLocation).toContain("/u/enter-password");
  });
});
