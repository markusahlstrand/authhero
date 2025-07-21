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
});
