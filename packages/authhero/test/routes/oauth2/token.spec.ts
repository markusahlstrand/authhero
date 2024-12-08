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

    it("should accept basic auth", async () => {
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
      it("should return an access token but no id token if the openid scope is missing", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        // Create the login session and code
        const loginSesssion = await env.data.logins.create("tenantId", {
          expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
          authParams: {
            client_id: "clientId",
            username: "foo@exampl.com",
            scope: "",
            audience: "http://example.com",
            redirect_uri: "http://example.com/callback",
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
              redirect_uri: "http://example.com/callback",
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
          aud: "http://example.com",
        });

        expect(body.id_token).toBeUndefined();
      });

      it("should return an id token if the openid scope is requested", async () => {
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
          aud: "http://example.com",
        });

        if (!body.id_token) {
          throw new Error("id_token is missing");
        }

        const idToken = parseJWT(body.id_token);

        expect(idToken?.payload).toMatchObject({
          sub: "email|userId",
          iss: "http://localhost:3000",
          aud: "clientId",
          nickname: "Test User",
          picture: "https://example.com/test.png",
          name: "Test User",
          email: "foo@example.com",
          email_verified: true,
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

      it("should return a 403 if the redirect-url does not match the url passed in the authorize call", async () => {
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
            redirect_uri: "http://example/callback",
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

        expect(response.status).toBe(403);
        const body = await response.text();

        expect(body).toBe("Invalid redirect uri");
      });

      it("should return a 403 if the client id does not match the client id passed in the authorize call", async () => {
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
              client_id: "otherClientId",
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

        expect(body).toBe("Invalid client");
      });

      it("should return a 403 if the code is expired", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        // Create the login session and expired code
        const loginSession = await env.data.logins.create("tenantId", {
          expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
          authParams: {
            client_id: "clientId",
            username: "foo@example.com",
            scope: "openid",
            audience: "http://example.com",
          },
        });

        await env.data.codes.create("tenantId", {
          code_type: "authorization_code",
          user_id: "email|userId",
          code_id: "123456",
          login_id: loginSession.login_id,
          expires_at: new Date(Date.now() - 1000).toISOString(), // Set to expired
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

        expect(response.status).toBe(403);
        const body = await response.text();
        expect(body).toBe("Code expired");
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

    describe("authorization_code with PKCE", () => {
      it("should return an access token when using a plain code_challenge_method", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        // Create the login session and code
        const loginSesssion = await env.data.logins.create("tenantId", {
          expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
          authParams: {
            client_id: "clientId",
            username: "foo@exampl.com",
            scope: "",
            audience: "http://example.com",
          },
        });

        await env.data.codes.create("tenantId", {
          code_type: "authorization_code",
          user_id: "email|userId",
          code_id: "123456",
          login_id: loginSesssion.login_id,
          code_verifier: "code_verifier",
          expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
        });

        const response = await client.oauth.token.$post(
          {
            form: {
              grant_type: "authorization_code",
              code: "123456",
              redirect_uri: "http://localhost:3000/callback",
              client_id: "clientId",
              code_challenge: "code_verifier",
              code_challenge_method: "plain",
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
          aud: "http://example.com",
        });

        expect(body.id_token).toBeUndefined();
      });

      it("should return an 403 if the code challenge does not match", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        // Create the login session and code
        const loginSesssion = await env.data.logins.create("tenantId", {
          expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
          authParams: {
            client_id: "clientId",
            username: "foo@exampl.com",
            scope: "",
            audience: "http://example.com",
          },
        });

        await env.data.codes.create("tenantId", {
          code_type: "authorization_code",
          user_id: "email|userId",
          code_id: "123456",
          login_id: loginSesssion.login_id,
          code_verifier: "code_verifier",
          expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
        });

        const response = await client.oauth.token.$post(
          {
            form: {
              grant_type: "authorization_code",
              code: "123456",
              redirect_uri: "http://localhost:3000/callback",
              client_id: "clientId",
              code_challenge: "incorrect_code_verifier",
              code_challenge_method: "plain",
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

        expect(body).toBe("Invalid code challenge");
      });
    });
  });
});
