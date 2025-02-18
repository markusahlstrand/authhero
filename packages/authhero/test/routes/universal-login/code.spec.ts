import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";

describe("passwords", () => {
  it("should login using a code", async () => {
    const { universalApp, oauthApp, env, getSentEmails } = await getTestServer({
      mockEmail: true,
    });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

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
      form: { username: "foo@example.com" },
    });
    expect(enterEmailPostResponse.status).toBe(302);

    // --------------------------------
    // enter correct code
    // --------------------------------
    const enterCodeGetResponse = await universalClient["enter-code"].$get({
      query: { state },
    });
    expect(enterCodeGetResponse.status).toBe(200);

    const email = getSentEmails()[0];
    const { code, magicLink } = email.data;

    const magicLinkUrl = new URL(magicLink);
    expect(magicLinkUrl.pathname).toBe("/passwordless/verify_redirect");
    expect(magicLinkUrl.searchParams.get("verification_code")).toBeTypeOf(
      "string",
    );
    expect(magicLinkUrl.searchParams.get("state")).toBe("state");
    expect(magicLinkUrl.searchParams.get("scope")).toBe("openid email profile");
    expect(magicLinkUrl.searchParams.get("redirect_uri")).toBe(
      "https://example.com/callback",
    );
    expect(magicLinkUrl.searchParams.get("email")).toBe("foo@example.com");
    expect(magicLinkUrl.searchParams.get("client_id")).toBe("clientId");
    expect(magicLinkUrl.searchParams.get("connection")).toBe("email");

    const enterCodePostResponse = await universalClient["enter-code"].$post({
      query: { state },
      form: { code },
    });

    expect(enterCodePostResponse.status).toBe(302);
    const enterCodeLocation = enterCodePostResponse.headers.get("location");
    if (!enterCodeLocation) {
      throw new Error("No location header found");
    }

    const redirectUri = new URL(enterCodeLocation);
    expect(redirectUri.pathname).toEqual("/callback");
    expect(redirectUri.searchParams.get("code")).toBeTypeOf("string");
    expect(redirectUri.searchParams.get("state")).toBe("state");

    // --------------------------------
    // re-use code
    // --------------------------------
    const reUseCodeResponse = await universalClient["enter-code"].$post({
      query: { state },
      form: { code: email.data.code },
    });

    expect(reUseCodeResponse.status).toBe(400);

    const reUsedCode = await reUseCodeResponse.text();
    expect(reUsedCode).toContain("Code already used");

    // --------------------------------
    // Incorrect code
    // --------------------------------
    const increctCodeResponse = await universalClient["enter-code"].$post({
      query: { state },
      form: { code: "222222" },
    });

    expect(increctCodeResponse.status).toBe(400);

    const incorrectCodeBody = await increctCodeResponse.text();
    expect(incorrectCodeBody).toContain("Code not found or expired");
  });
});
