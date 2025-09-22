import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { parseJWT } from "oslo/jwt";
import { computeCodeChallenge } from "../../../src/utils/crypto";
import {
  CodeChallengeMethod,
  AuthorizationResponseType,
} from "@authhero/adapter-interfaces";
import { createSessions } from "../../helpers/create-session";

interface TokenResponse {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

interface ErrorResponse {
  error: string;
  error_description: string;
}

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
      const body = (await response.json()) as TokenResponse;

      const accessToken = parseJWT(body.access_token);
      expect(accessToken?.payload).toMatchObject({
        sub: "clientId",
        iss: "http://localhost:3000/",
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
      const body = (await response.json()) as TokenResponse;

      const accessToken = parseJWT(body.access_token);
      expect(accessToken?.payload).toMatchObject({
        sub: "clientId",
        iss: "http://localhost:3000/",
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

      expect(body).toBe("Invalid client credentials");
    });

    it("should return all granted scopes when no scope is specified in client_credentials", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      // Create a resource server
      await env.data.resourceServers.create("tenantId", {
        name: "Test API",
        identifier: "https://test-api.example.com",
        scopes: [
          { value: "read:users", description: "Read users" },
          { value: "write:users", description: "Write users" },
          { value: "read:posts", description: "Read posts" },
        ],
      });

      // Create a client grant with specific scopes
      await env.data.clientGrants.create("tenantId", {
        client_id: "clientId",
        audience: "https://test-api.example.com",
        scope: ["read:users", "write:users"], // Grant only these scopes
      });

      // Test client credentials request WITHOUT specifying scope parameter
      const response = await client.oauth.token.$post(
        {
          form: {
            grant_type: "client_credentials",
            client_id: "clientId",
            client_secret: "clientSecret",
            audience: "https://test-api.example.com",
            // Note: No 'scope' parameter specified
          },
        },
        {
          headers: {
            "tenant-id": "tenantId",
          },
        },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as TokenResponse;

      const accessToken = parseJWT(body.access_token);
      expect(accessToken?.payload).toMatchObject({
        sub: "clientId",
        iss: "http://localhost:3000/",
        aud: "https://test-api.example.com",
      });

      // The token should include both granted scopes since no specific scopes were requested
      const payload = accessToken?.payload as any;
      expect(payload.scope).toContain("read:users");
      expect(payload.scope).toContain("write:users");
      expect(payload.scope).not.toContain("read:posts"); // This wasn't granted
    });

    it("should return only requested scopes when scope is specified in client_credentials", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      // Create a resource server (same as in the previous test)
      await env.data.resourceServers.create("tenantId", {
        name: "Test API",
        identifier: "https://test-api.example.com",
        scopes: [
          { value: "read:users", description: "Read users" },
          { value: "write:users", description: "Write users" },
          { value: "read:posts", description: "Read posts" },
        ],
      });

      // Create a client grant with specific scopes
      await env.data.clientGrants.create("tenantId", {
        client_id: "clientId",
        audience: "https://test-api.example.com",
        scope: ["read:users", "write:users"], // Grant both scopes
      });

      // Test client credentials request WITH specific scope parameter
      const response = await client.oauth.token.$post(
        {
          form: {
            grant_type: "client_credentials",
            client_id: "clientId",
            client_secret: "clientSecret",
            audience: "https://test-api.example.com",
            scope: "read:users", // Only request one scope
          },
        },
        {
          headers: {
            "tenant-id": "tenantId",
          },
        },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as TokenResponse;

      const accessToken = parseJWT(body.access_token);
      expect(accessToken?.payload).toMatchObject({
        sub: "clientId",
        iss: "http://localhost:3000/",
        aud: "https://test-api.example.com",
      });

      // Should only include the requested scope
      const payload2 = accessToken?.payload as any;
      expect(payload2.scope).toContain("read:users");
      expect(payload2.scope).not.toContain("write:users"); // This was granted but not requested
    });
  });

  describe("authorization_code", () => {
    describe("authorization_code", () => {
      it("should return an access token but no id token if the openid scope is missing", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        // Create the login session and code
        const loginSesssion = await env.data.loginSessions.create("tenantId", {
          expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
          csrf_token: "csrfToken",
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
          login_id: loginSesssion.id,
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
        const body = (await response.json()) as TokenResponse;

        const accessToken = parseJWT(body.access_token);
        expect(accessToken?.payload).toMatchObject({
          sub: "email|userId",
          iss: "http://localhost:3000/",
          aud: "http://example.com",
        });

        expect(body.id_token).toBeUndefined();
      });

      it("should return an id token if the openid scope is requested", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        // Create the login session and code
        const loginSesssion = await env.data.loginSessions.create("tenantId", {
          expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
          csrf_token: "csrfToken",
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
          login_id: loginSesssion.id,
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
        const body = (await response.json()) as TokenResponse;

        const accessToken = parseJWT(body.access_token);
        expect(accessToken?.payload).toMatchObject({
          sub: "email|userId",
          iss: "http://localhost:3000/",
          aud: "http://example.com",
        });

        if (!body.id_token) {
          throw new Error("id_token is missing");
        }

        const idToken = parseJWT(body.id_token);

        expect(idToken?.payload).toMatchObject({
          sub: "email|userId",
          iss: "http://localhost:3000/",
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

        expect(body).toBe("Invalid client credentials");
      });

      it("should return a 403 if the redirect-url does not match the url passed in the authorize call", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        // Create the login session and code
        const loginSesssion = await env.data.loginSessions.create("tenantId", {
          expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
          csrf_token: "csrfToken",
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
          login_id: loginSesssion.id,
          expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
          redirect_uri: "http://example/callback",
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
        const loginSesssion = await env.data.loginSessions.create("tenantId", {
          expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
          csrf_token: "csrfToken",
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
          login_id: loginSesssion.id,
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

        expect(body).toBe("Client not found");
      });

      it("should return a 403 if the code is expired", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        // Create the login session and expired code
        const loginSession = await env.data.loginSessions.create("tenantId", {
          expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
          csrf_token: "csrfToken",
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
          login_id: loginSession.id,
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
        const { loginSession } = await createSessions(env.data);

        await env.data.codes.create("tenantId", {
          code_type: "authorization_code",
          user_id: "email|userId",
          code_id: "123456",
          login_id: loginSession.id,
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

      it("should set a silent authentication token", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        // Create the login session and code
        const { loginSession } = await createSessions(env.data);

        await env.data.codes.create("tenantId", {
          code_type: "authorization_code",
          user_id: "email|userId",
          code_id: "123456",
          login_id: loginSession.id,
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
        const body = (await response.json()) as TokenResponse;

        const accessToken = parseJWT(body.access_token);

        if (!accessToken || !("sid" in accessToken.payload)) {
          throw new Error("sid is missing");
        }

        const cookie = response.headers.get("set-cookie");
        expect(cookie).toBe(
          `tenantId-auth-token=${accessToken?.payload.sid}; HttpOnly; Max-Age=2592000; Path=/; SameSite=None; Secure`,
        );
      });

      it("should return invalid_grant error when reusing the same authorization code", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        // Create the login session and code
        const { loginSession } = await createSessions(env.data);

        await env.data.codes.create("tenantId", {
          code_type: "authorization_code",
          user_id: "email|userId",
          code_id: "123456",
          login_id: loginSession.id,
          expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
        });

        // First request should succeed
        const firstResponse = await client.oauth.token.$post(
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
        expect(firstResponse.status).toBe(200);
        const firstBody = (await firstResponse.json()) as TokenResponse;
        expect(firstBody.access_token).toBeDefined();

        // Second request with the same code should fail
        const secondResponse = await client.oauth.token.$post(
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
        expect(secondResponse.status).toBe(403);
        const secondBody = (await secondResponse.json()) as ErrorResponse;
        expect(secondBody).toEqual({
          error: "invalid_grant",
          error_description: "Invalid authorization code",
        });
      });
    });

    describe("authorization_code with PKCE", () => {
      it("should return an access token when using a plain code_challenge_method", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        const codeChallenge =
          "code_verifier,code_verifier,code_verifier,code_verifier";

        // Create the login session and code
        const loginSesssion = await env.data.loginSessions.create("tenantId", {
          expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
          csrf_token: "csrfToken",
          authParams: {
            client_id: "clientId",
            username: "foo@exampl.com",
            scope: "",
            audience: "http://example.com",
            code_challenge: codeChallenge,
            code_challenge_method: CodeChallengeMethod.Plain,
          },
        });

        await env.data.codes.create("tenantId", {
          code_type: "authorization_code",
          user_id: "email|userId",
          code_id: "123456",
          login_id: loginSesssion.id,
          expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
        });

        const response = await client.oauth.token.$post(
          {
            form: {
              grant_type: "authorization_code",
              code: "123456",
              redirect_uri: "http://localhost:3000/callback",
              client_id: "clientId",
              code_verifier: codeChallenge,
            },
          },
          {
            headers: {
              "tenant-id": "tenantId",
            },
          },
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as TokenResponse;

        const accessToken = parseJWT(body.access_token);
        expect(accessToken?.payload).toMatchObject({
          sub: "email|userId",
          iss: "http://localhost:3000/",
          aud: "http://example.com",
        });

        expect(body.id_token).toBeUndefined();
      });

      it("should return an access token when using a S256 code_challenge_method", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        const codeChallenge =
          "code_verifier,code_verifier,code_verifier,code_verifier";

        // Create the login session and code
        const loginSesssion = await env.data.loginSessions.create("tenantId", {
          expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
          csrf_token: "csrfToken",
          authParams: {
            client_id: "clientId",
            username: "foo@exampl.com",
            scope: "",
            audience: "http://example.com",
            code_challenge: await computeCodeChallenge(codeChallenge, "S256"),
            code_challenge_method: CodeChallengeMethod.S256,
          },
        });

        await env.data.codes.create("tenantId", {
          code_type: "authorization_code",
          user_id: "email|userId",
          code_id: "123456",
          login_id: loginSesssion.id,
          expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
        });

        const response = await client.oauth.token.$post(
          {
            form: {
              grant_type: "authorization_code",
              code: "123456",
              redirect_uri: "http://localhost:3000/callback",
              client_id: "clientId",
              code_verifier: codeChallenge,
            },
          },
          {
            headers: {
              "tenant-id": "tenantId",
            },
          },
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as TokenResponse;

        const accessToken = parseJWT(body.access_token);
        expect(accessToken?.payload).toMatchObject({
          sub: "email|userId",
          iss: "http://localhost:3000/",
          aud: "http://example.com",
        });

        expect(body.id_token).toBeUndefined();
      });

      it("should return an 403 if the code challenge does not match", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        const codeChallenge =
          "code_verifier,code_verifier,code_verifier,code_verifier";

        // Create the login session and code
        const loginSesssion = await env.data.loginSessions.create("tenantId", {
          expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
          csrf_token: "csrfToken",
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
          login_id: loginSesssion.id,
          expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
          code_challenge: codeChallenge,
          code_challenge_method: CodeChallengeMethod.S256,
        });

        const response = await client.oauth.token.$post(
          {
            form: {
              grant_type: "authorization_code",
              code: "123456",
              redirect_uri: "http://localhost:3000/callback",
              client_id: "clientId",
              code_verifier: "incorrect_code_" + codeChallenge,
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

        expect(body).toBe("Invalid client credentials");
      });
    });
  });

  describe("refresh_token", () => {
    it("should return a new access token and refresh token", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      const idle_expires_at = new Date(
        Date.now() + 1000 * 60 * 60,
      ).toISOString();

      await env.data.refreshTokens.create("tenantId", {
        id: "refreshToken",
        session_id: "sessionId",
        user_id: "email|userId",
        client_id: "clientId",
        resource_servers: [
          {
            audience: "http://example.com",
            scopes: "openid",
          },
        ],
        device: {
          last_ip: "",
          initial_ip: "",
          last_user_agent: "",
          initial_user_agent: "",
          initial_asn: "",
          last_asn: "",
        },
        rotating: false,
        idle_expires_at,
        expires_at: idle_expires_at,
      });

      const response = await client.oauth.token.$post(
        {
          form: {
            grant_type: "refresh_token",
            refresh_token: "refreshToken",
            client_id: "clientId",
          },
        },
        { headers: { "tenant-id": "tenantId" } },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as TokenResponse;
      expect(body).toMatchObject({
        access_token: expect.any(String),
        refresh_token: expect.any(String),
        id_token: expect.any(String),
      });

      const refreshToken = await env.data.refreshTokens.get(
        "tenantId",
        "refreshToken",
      );
      if (!refreshToken) {
        throw new Error("Refresh token not found");
      }

      expect(refreshToken.idle_expires_at).not.toBe(idle_expires_at);
    });

    it("should return a 403 for a expired refresh token", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      await env.data.refreshTokens.create("tenantId", {
        id: "refreshToken",
        session_id: "sessionId",
        user_id: "email|userId",
        client_id: "clientId",
        resource_servers: [
          {
            audience: "http://example.com",
            scopes: "openid",
          },
        ],
        device: {
          last_ip: "",
          initial_ip: "",
          last_user_agent: "",
          initial_user_agent: "",
          initial_asn: "",
          last_asn: "",
        },
        rotating: false,
        expires_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      });

      const response = await client.oauth.token.$post(
        {
          form: {
            grant_type: "refresh_token",
            refresh_token: "refreshToken",
            client_id: "clientId",
          },
        },
        { headers: { "tenant-id": "tenantId" } },
      );

      expect(response.status).toBe(403);
      const body = (await response.json()) as ErrorResponse;
      expect(body).toEqual({
        error: "invalid_grant",
        error_description: "Refresh token has expired",
      });
    });

    it("should return a 403 for a idle expired refresh token", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      await env.data.refreshTokens.create("tenantId", {
        id: "refreshToken",
        session_id: "sessionId",
        user_id: "email|userId",
        client_id: "clientId",
        resource_servers: [
          {
            audience: "http://example.com",
            scopes: "openid",
          },
        ],
        device: {
          last_ip: "",
          initial_ip: "",
          last_user_agent: "",
          initial_user_agent: "",
          initial_asn: "",
          last_asn: "",
        },
        rotating: false,
        idle_expires_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      });

      const response = await client.oauth.token.$post(
        {
          form: {
            grant_type: "refresh_token",
            refresh_token: "refreshToken",
            client_id: "clientId",
          },
        },
        { headers: { "tenant-id": "tenantId" } },
      );

      expect(response.status).toBe(403);
      const body = (await response.json()) as ErrorResponse;
      expect(body).toEqual({
        error: "invalid_grant",
        error_description: "Refresh token has expired",
      });
    });
  });

  describe("organization-aware authorization_code flow", () => {
    it("should throw 403 error when user is not a member of the required organization", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      // Create a resource server with RBAC enabled
      const resourceServer = await env.data.resourceServers.create("tenantId", {
        name: "Test API with Organization Token",
        identifier: "https://org-token-api.example.com",
        scopes: [{ value: "read:users", description: "Read users" }],
        options: {
          enforce_policies: true,
          token_dialect: "access_token_authz",
        },
      });

      // Create a user
      const user = await env.data.users.create("tenantId", {
        user_id: "email|token-test-user",
        email: "token-test@example.com",
        provider: "email",
        connection: "email",
        email_verified: true,
        is_social: false,
      });

      // Create a login session with organization in authParams
      const loginSession = await env.data.loginSessions.create("tenantId", {
        authParams: {
          client_id: "clientId",
          audience: "https://org-token-api.example.com",
          scope: "read:users",
          organization: "nonexistent-org-id", // User is not a member of this org
          redirect_uri: "https://example.com/callback",
          response_type: AuthorizationResponseType.CODE,
        },
        expires_at: new Date(Date.now() + 600000).toISOString(),
        csrf_token: "test-csrf-token",
      });

      // Create an authorization code with organization in authParams
      const code = await env.data.codes.create("tenantId", {
        code_id: "test-org-code",
        user_id: user.user_id,
        code_type: "authorization_code",
        login_id: loginSession.id,
        expires_at: new Date(Date.now() + 600000).toISOString(), // 10 minutes from now
        redirect_uri: "https://example.com/callback",
      });
      void code; // Used for test setup

      // Try to exchange the code for tokens
      const response = await client.oauth.token.$post({
        form: {
          grant_type: "authorization_code",
          client_id: "clientId",
          client_secret: "clientSecret",
          code: "test-org-code",
          redirect_uri: "https://example.com/callback",
        },
      });

      expect(response.status).toBe(403);
      const body = (await response.json()) as ErrorResponse;
      expect(body).toEqual({
        error: "access_denied",
        error_description: "User is not a member of the specified organization",
      });

      // Clean up
      await env.data.resourceServers.remove("tenantId", resourceServer.id!);
      await env.data.users.remove("tenantId", user.user_id);
    });

    it("should return tokens with calculated scopes for organization members", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      // Create a resource server with RBAC enabled
      const resourceServer = await env.data.resourceServers.create("tenantId", {
        name: "Test API with Organization Scopes",
        identifier: "https://org-scopes-api.example.com",
        scopes: [
          { value: "read:users", description: "Read users" },
          { value: "write:users", description: "Write users" },
        ],
        options: {
          enforce_policies: true,
          token_dialect: "access_token",
        },
      });

      // Create an organization
      const organization = await env.data.organizations.create("tenantId", {
        name: "Token Test Organization",
        display_name: "Token Test Org",
      });

      // Create a user
      const user = await env.data.users.create("tenantId", {
        user_id: "email|token-org-member",
        email: "token-org-member@example.com",
        provider: "email",
        connection: "email",
        email_verified: true,
        is_social: false,
      });

      // Add user to organization
      await env.data.userOrganizations.create("tenantId", {
        user_id: user.user_id,
        organization_id: organization.id,
      });

      // Create a role and assign permissions
      const role = await env.data.roles.create("tenantId", {
        name: "Token Org Reader",
        description: "Can read in token org",
      });

      await env.data.rolePermissions.assign("tenantId", role.id, [
        {
          role_id: role.id,
          resource_server_identifier: "https://org-scopes-api.example.com",
          permission_name: "read:users",
        },
      ]);

      // Assign role to user within organization
      await env.data.userRoles.create(
        "tenantId",
        user.user_id,
        role.id,
        organization.id,
      );

      // Create a login session with organization
      const loginSession = await env.data.loginSessions.create("tenantId", {
        authParams: {
          client_id: "clientId",
          audience: "https://org-scopes-api.example.com",
          scope: "read:users write:users", // Request both scopes
          organization: organization.id,
          redirect_uri: "https://example.com/callback",
          response_type: AuthorizationResponseType.CODE,
        },
        expires_at: new Date(Date.now() + 600000).toISOString(),
        csrf_token: "test-csrf-token-2",
      });

      // Create an authorization code
      const code = await env.data.codes.create("tenantId", {
        code_id: "test-org-scopes-code",
        user_id: user.user_id,
        code_type: "authorization_code",
        login_id: loginSession.id,
        expires_at: new Date(Date.now() + 600000).toISOString(),
        redirect_uri: "https://example.com/callback",
      });
      void code; // Used for test setup

      // Exchange code for tokens
      const response = await client.oauth.token.$post({
        form: {
          grant_type: "authorization_code",
          client_id: "clientId",
          client_secret: "clientSecret",
          code: "test-org-scopes-code",
          redirect_uri: "https://example.com/callback",
        },
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as TokenResponse;

      expect(body).toHaveProperty("access_token");
      expect(body).toHaveProperty("token_type", "Bearer");

      // Parse the access token to check org_id and scopes
      const accessToken = parseJWT(body.access_token);
      const payload = accessToken?.payload as any;

      expect(accessToken).not.toBeNull();
      expect(payload.org_id).toBe(organization.id);
      // Should only include the scope the user has permission for
      expect(payload.scope).toBe("read:users");

      // Clean up
      await env.data.resourceServers.remove("tenantId", resourceServer.id!);
      await env.data.organizations.remove("tenantId", organization.id);
      await env.data.roles.remove("tenantId", role.id);
      await env.data.users.remove("tenantId", user.user_id);
    });
  });
});
