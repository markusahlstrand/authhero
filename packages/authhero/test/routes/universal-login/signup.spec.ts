import { describe, it, expect } from "vitest";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { getPrimaryUserByEmail } from "../../../src/helpers/users";

describe("signup", () => {
  it("should allow a user to sign up with email verification and set a password, linking an auth2 account", async () => {
    const { universalApp, oauthApp, env, getSentEmails } = await getTestServer({
      mockEmail: true,
      testTenantLanguage: "en",
    });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    // Start the OAuth authorization flow
    const authorizeResponse = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        state: "state",
        nonce: "nonce",
        scope: "openid email profile",
        response_type: AuthorizationResponseType.CODE,
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
        form: { username: "foo@example.com" },
      },
    );

    expect(enterEmailPostResponse.status).toBe(302);

    // Go to pre-signup page (enter email)
    const preSignupGet = await universalClient["pre-signup"].$get({
      query: { state },
    });
    expect(preSignupGet.status).toBe(200);
    const preSignupPost = await universalClient["pre-signup"].$post({
      query: { state },
    });
    expect(preSignupPost.status).toBe(302);

    // Should have sent a verification email
    const sentEmails = getSentEmails();
    expect(sentEmails.length).toBeGreaterThan(0);
    const signupEmail = sentEmails.find((e) => e.data.signupUrl);
    expect(signupEmail).toBeTruthy();
    const signupUrl = new URL(signupEmail.data.signupUrl);
    const code = signupUrl.searchParams.get("code");
    if (!code) {
      throw new Error("No code found in signup URL");
    }

    // Visit signup page with code
    const signupGetWithCode = await universalClient["signup"].$get({
      query: { state, code },
    });
    expect(signupGetWithCode.status).toBe(200);

    // Submit password
    const password = "MyStr0ng#Password1";
    const signupPostWithCode = await universalClient["signup"].$post({
      query: { state },
      form: {
        password,
        "re-enter-password": password,
        code,
      },
    });
    expect(signupPostWithCode.status).toBe(302);

    // Check that an auth2 account is now linked to foo@example.com
    const user = await getPrimaryUserByEmail({
      userAdapter: env.data.users,
      email: "foo@example.com",
      tenant_id: "tenantId",
    });

    if (!user) {
      throw new Error("User not found");
    }
    expect(user.identities?.length).toBe(2);
  });
});
