import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { parseJWT } from "oslo/jwt";

describe("token", () => {
  describe("client_credentials", () => {
    it("should return tokens", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      await env.data.applications.create("tenantId", {
        id: "clientId",
        client_secret: "clientSecret",
        name: "Test Client",
        callbacks: [],
        disable_sign_ups: false,
      });

      const response = await client.oauth.token.$post(
        {
          form: {
            grant_type: "client_credentials",
            audience: "https://example.com",
          },
        },
        {
          headers: {
            "tenant-id": "tenantId",
            authorization: "Basic " + btoa("clientId:clientSecret"),
          },
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      const accessToken = parseJWT(body.access_token);
      expect(accessToken?.payload).toMatchObject({
        sub: "clientId",
        iss: "http://localhost:3000",
      });
    });
  });
});
