import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import bcryptjs from "bcryptjs";
import { getTestServer } from "../../helpers/test-server";

describe("passwords", () => {
  it("should login using a password", async () => {
    const { universalApp, oauthApp, env } = await getTestServer({
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
    const enterEmailGetResponse = await universalClient["enter-email"].$get({
      query: { state },
    });
    expect(enterEmailGetResponse.status).toBe(200);

    const enterEmailPostResponse = await universalClient["enter-email"].$post({
      query: { state },
      form: { username: "foo2@example.com" },
    });
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
  });
});
