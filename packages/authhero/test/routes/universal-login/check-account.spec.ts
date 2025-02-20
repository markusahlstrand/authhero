import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";

describe("check account", () => {
  it("should login using a session", async () => {
    const { universalApp, oauthApp, env } = await getTestServer({
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
    // check account without session
    // --------------------------------
    const enterEmailGetResponse = await universalClient["check-account"].$get({
      query: { state },
    });
    expect(enterEmailGetResponse.status).toBe(302);

    const loginLocation = enterEmailGetResponse.headers.get("location");
    expect(loginLocation).toContain(`/u/enter-email?state=${state}`);
  });
});
