import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { parseJWT } from "oslo/jwt";

describe("token", () => {
  describe("client_credentials", () => {
    it("should return an access token", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      const response = await client.oauth.token.$post(
        {
          form: {
            grant_type: "client_credentials",
            client_id: "clientId",
            client_secret: "clientSecret",
            audience: "https://example.com",
          },
        },
        {
          headers: {
            "tenant-id": "tenantId",
          },
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      const accessToken = parseJWT(body.access_token);
      expect(accessToken?.payload).toMatchObject({
        sub: "clientId",
        iss: "http://localhost:3000",
        aud: "https://example.com",
      });
    });

    it("should return accept basic auth", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

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
        aud: "https://example.com",
      });
    });

    it("should return a 403 if the client_secret is wrong", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      const response = await client.oauth.token.$post(
        {
          form: {
            grant_type: "client_credentials",
            client_id: "clientId",
            client_secret: "invilidClientSecret",
            audience: "https://example.com",
          },
        },
        {
          headers: {
            "tenant-id": "tenantId",
          },
        },
      );

      expect(response.status).toBe(403);
      const body = await response.text();

      expect(body).toBe("Invalid secret");
    });
  });

  describe("authorization_code", () => {
    describe("authorization_code", () => {
      it("should return an access token", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        // Create the login session and code
        const loginSesssion = await env.data.logins.create("tenantId", {
          expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
          authParams: {
            client_id: "clientId",
            username: "foo@exampl.com",
            scope: "openid",
            audience: "http://example.com",
          },
        });

        await env.data.codes.create("tenantId", {
          code_type: "authorization_code",
          user_id: "email|userId",
          code_id: "123456",
          login_id: loginSesssion.login_id,
          expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
        });

        const response = await client.oauth.token.$post(
          {
            form: {
              grant_type: "authorization_code",
              code: "123456",
              redirect_uri: "http://localhost:3000/callback",
              client_id: "clientId",
              client_secret: "clientSecret",
            },
          },
          {
            headers: {
              "tenant-id": "tenantId",
            },
          },
        );

        expect(response.status).toBe(200);
        const body = await response.json();

        const accessToken = parseJWT(body.access_token);
        expect(accessToken?.payload).toMatchObject({
          sub: "email|userId",
          iss: "http://localhost:3000",
          aud: "default",
        });
      });

      it("should return a 403 if the code is wrong", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        const response = await client.oauth.token.$post(
          {
            form: {
              grant_type: "authorization_code",
              code: "222222",
              redirect_uri: "http://localhost:3000/callback",
              client_id: "clientId",
              client_secret: "clientSecret",
            },
          },
          {
            headers: {
              "tenant-id": "tenantId",
            },
          },
        );

        expect(response.status).toBe(403);
        const body = await response.text();

        expect(body).toBe("Invalid code");
      });

      it("should return a 403 if the code is used twice", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        // Create the login session and code
        const loginSesssion = await env.data.logins.create("tenantId", {
          expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
          authParams: {
            client_id: "clientId",
            username: "foo@exampl.com",
            scope: "openid",
            audience: "http://example.com",
          },
        });

        await env.data.codes.create("tenantId", {
          code_type: "authorization_code",
          user_id: "email|userId",
          code_id: "123456",
          login_id: loginSesssion.login_id,
          expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
        });

        // First request
        const firstResponse = await client.oauth.token.$post(
          {
            form: {
              grant_type: "authorization_code",
              code: "123456",
              redirect_uri: "http://localhost:3000/callback",
              client_id: "clientId",
              client_secret: "clientSecret",
            },
          },
          {
            headers: {
              "tenant-id": "tenantId",
            },
          },
        );

        expect(firstResponse.status).toBe(200);

        // Second request with the same code
        const secondResponse = await client.oauth.token.$post(
          {
            form: {
              grant_type: "authorization_code",
              code: "123456",
              redirect_uri: "http://localhost:3000/callback",
              client_id: "clientId",
              client_secret: "clientSecret",
            },
          },
          {
            headers: {
              "tenant-id": "tenantId",
            },
          },
        );

        expect(secondResponse.status).toBe(403);
      });
    });
  });
});
