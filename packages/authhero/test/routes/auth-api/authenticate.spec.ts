import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";

describe("authenticate", () => {
  it("should return a ticket for a successful username password login", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const response = await client.v2.logout.$get({
      query: {
        client_id: "clientId",
        returnTo: "https://example/callback",
      },
    });

    expect(response.status).toBe(302);

    const location = response.headers.get("location");
    expect(location).toBe("https://example/callback");

    const cookie = response.headers.get("set-cookie");
    expect(cookie).toBe(
      "tenantId-auth-token=; HttpOnly; Max-Age=0; Path=/; SameSite=None; Secure",
    );
  });
});
