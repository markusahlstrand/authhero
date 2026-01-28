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
        // @ts-expect-error - testClient type requires both form and json
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
        // @ts-expect-error - testClient type requires both form and json
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
        // @ts-expect-error - testClient type requires both form and json
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
      const body = await response.json();

      expect(body).toEqual({ message: "Invalid client credentials" });
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
        // @ts-expect-error - testClient type requires both form and json
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

    it("should return intersection of requested and granted scopes when scopes are requested (Auth0 behavior)", async () => {
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
        // @ts-expect-error - testClient type requires both form and json
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

      // Auth0 behavior: when scopes ARE requested, return intersection of requested and granted
      const payload2 = accessToken?.payload as any;
      expect(payload2.scope).toContain("read:users");
      expect(payload2.scope).not.toContain("write:users"); // Only requested scope is returned
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
          // @ts-expect-error - testClient type requires both form and json
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
            scope: "openid profile email",
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
          // @ts-expect-error - testClient type requires both form and json
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

        // Auth0 compatible behavior: email and profile claims should be included
        // in the id_token when the corresponding scopes are requested.
        // The claims are also available from the userinfo endpoint.
        expect(idToken?.payload).toMatchObject({
          sub: "email|userId",
          iss: "http://localhost:3000/",
          aud: "clientId",
          // Auth0 includes profile/email claims in id_token when scopes are requested
          nickname: "Test User",
          name: "Test User",
          email: "foo@example.com",
          email_verified: true,
        });
      });

      it("should return a 403 if the code is wrong", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        const response = await client.oauth.token.$post(
          // @ts-expect-error - testClient type requires both form and json
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
        const body = await response.json();

        expect(body).toEqual({ message: "Invalid client credentials" });
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
          // @ts-expect-error - testClient type requires both form and json
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
        const body = await response.json();

        expect(body).toEqual({ message: "Invalid redirect uri" });
      });

      it("should return a 403 if redirect_uri differs only by trailing slash (strict comparison per RFC 6749)", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        // Create the login session with redirect_uri WITHOUT trailing slash
        const loginSesssion = await env.data.loginSessions.create("tenantId", {
          expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
          csrf_token: "csrfToken",
          authParams: {
            client_id: "clientId",
            username: "foo@exampl.com",
            scope: "openid",
            audience: "http://example.com",
            redirect_uri: "http://localhost:3000/callback",
          },
        });

        await env.data.codes.create("tenantId", {
          code_type: "authorization_code",
          user_id: "email|userId",
          code_id: "123456",
          login_id: loginSesssion.id,
          expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
          redirect_uri: "http://localhost:3000/callback",
        });

        // Try to exchange with redirect_uri WITH trailing slash - should fail per RFC 6749
        const response = await client.oauth.token.$post(
          // @ts-expect-error - testClient type requires both form and json
          {
            form: {
              grant_type: "authorization_code",
              code: "123456",
              redirect_uri: "http://localhost:3000/callback/", // Note: trailing slash
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
        const body = await response.json();
        expect(body).toEqual({ message: "Invalid redirect uri" });
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
          // @ts-expect-error - testClient type requires both form and json
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
        const body = await response.json();

        expect(body).toEqual({ message: "Client not found" });
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
          // @ts-expect-error - testClient type requires both form and json
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
        const body = await response.json();
        expect(body).toEqual({ message: "Code expired" });
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
          // @ts-expect-error - testClient type requires both form and json
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
          // @ts-expect-error - testClient type requires both form and json
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

        expect(secondResponse.status).toBe(400);
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
          // @ts-expect-error - testClient type requires both form and json
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

        const cookies = response.headers.get("set-cookie");
        // Double-Clear: Should have non-partitioned clear and partitioned cookie with session
        expect(cookies).toContain(
          "tenantId-auth-token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None",
        );
        expect(cookies).toContain(
          `tenantId-auth-token=${accessToken?.payload.sid}; Max-Age=2592000; Path=/; HttpOnly; Secure; Partitioned; SameSite=None`,
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
          // @ts-expect-error - testClient type requires both form and json
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
          // @ts-expect-error - testClient type requires both form and json
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
        expect(secondResponse.status).toBe(400);
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
          // @ts-expect-error - testClient type requires both form and json
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
          // @ts-expect-error - testClient type requires both form and json
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
          // @ts-expect-error - testClient type requires both form and json
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
        const body = await response.json();

        expect(body).toEqual({ message: "Invalid client credentials" });
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
        // @ts-expect-error - testClient type requires both form and json
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

    it("should preserve the original scopes in the new access token", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      const idle_expires_at = new Date(
        Date.now() + 1000 * 60 * 60,
      ).toISOString();

      // Create a refresh token with specific scopes (no resource server needed when RBAC is disabled)
      const originalScopes = "openid profile email read:users";
      await env.data.refreshTokens.create("tenantId", {
        id: "refreshTokenWithScopes",
        session_id: "sessionId",
        user_id: "email|userId",
        client_id: "clientId",
        resource_servers: [
          {
            audience: "http://example.com",
            scopes: originalScopes,
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
        // @ts-expect-error - testClient type requires both form and json
        {
          form: {
            grant_type: "refresh_token",
            refresh_token: "refreshTokenWithScopes",
            client_id: "clientId",
          },
        },
        { headers: { "tenant-id": "tenantId" } },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as TokenResponse;
      expect(body.access_token).toBeDefined();

      // Parse the access token and verify the scope claim
      const accessToken = parseJWT(body.access_token);
      expect(accessToken).not.toBeNull();

      const payload = accessToken?.payload as { scope?: string };
      expect(payload.scope).toBe(originalScopes);
    });

    it("should return a 400 for a expired refresh token", async () => {
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
        // @ts-expect-error - testClient type requires both form and json
        {
          form: {
            grant_type: "refresh_token",
            refresh_token: "refreshToken",
            client_id: "clientId",
          },
        },
        { headers: { "tenant-id": "tenantId" } },
      );

      expect(response.status).toBe(400);
      const body = (await response.json()) as ErrorResponse;
      expect(body).toEqual({
        error: "invalid_grant",
        error_description: "Refresh token has expired",
      });
    });

    it("should return a 400 for a idle expired refresh token", async () => {
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
        // @ts-expect-error - testClient type requires both form and json
        {
          form: {
            grant_type: "refresh_token",
            refresh_token: "refreshToken",
            client_id: "clientId",
          },
        },
        { headers: { "tenant-id": "tenantId" } },
      );

      expect(response.status).toBe(400);
      const body = (await response.json()) as ErrorResponse;
      expect(body).toEqual({
        error: "invalid_grant",
        error_description: "Refresh token has expired",
      });
    });

    it("should accept client_id and client_secret in refresh token request", async () => {
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
        // @ts-expect-error
        {
          form: {
            grant_type: "refresh_token",
            refresh_token: "refreshToken",
            client_id: "clientId",
            client_secret: "clientSecret",
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
    });

    it("should accept client_id and client_secret via basic auth in refresh token request", async () => {
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
        // @ts-expect-error - testClient type requires both form and json
        {
          form: {
            grant_type: "refresh_token",
            refresh_token: "refreshToken",
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
      expect(body).toMatchObject({
        access_token: expect.any(String),
        refresh_token: expect.any(String),
        id_token: expect.any(String),
      });
    });

    it("should return a 403 if the client_secret is wrong in refresh token request", async () => {
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
        // @ts-expect-error - testClient type requires both form and json
        {
          form: {
            grant_type: "refresh_token",
            refresh_token: "refreshToken",
            client_id: "clientId",
            client_secret: "invalidClientSecret",
          },
        },
        { headers: { "tenant-id": "tenantId" } },
      );

      expect(response.status).toBe(403);
      const body = (await response.json()) as ErrorResponse;
      expect(body).toEqual({
        error: "invalid_client",
        error_description: "Client authentication failed",
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
      const response = await client.oauth.token.$post(
        // @ts-expect-error - testClient type requires both form and json
        {
          form: {
            grant_type: "authorization_code",
            client_id: "clientId",
            client_secret: "clientSecret",
            code: "test-org-code",
            redirect_uri: "https://example.com/callback",
          },
        },
      );

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
      const response = await client.oauth.token.$post(
        // @ts-expect-error - testClient type requires both form and json
        {
          form: {
            grant_type: "authorization_code",
            client_id: "clientId",
            client_secret: "clientSecret",
            code: "test-org-scopes-code",
            redirect_uri: "https://example.com/callback",
          },
        },
      );

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

    it("should accept organization parameter when it matches login session organization", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      // Create an organization
      const organization = await env.data.organizations.create("tenantId", {
        name: "Test Organization for Token Grant",
        display_name: "Test Org Token Grant",
      });

      // Create a user
      const user = await env.data.users.create("tenantId", {
        user_id: "email|token-org-param-user",
        email: "token-org-param@example.com",
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

      // Create a login session with organization in authParams
      const loginSession = await env.data.loginSessions.create("tenantId", {
        authParams: {
          client_id: "clientId",
          audience: "https://example.com/api",
          scope: "openid profile",
          organization: organization.id,
          redirect_uri: "https://example.com/callback",
          response_type: AuthorizationResponseType.CODE,
        },
        expires_at: new Date(Date.now() + 600000).toISOString(),
        csrf_token: "test-csrf-token-org-param",
      });

      // Create an authorization code
      const code = await env.data.codes.create("tenantId", {
        code_id: "test-org-param-code",
        user_id: user.user_id,
        code_type: "authorization_code",
        login_id: loginSession.id,
        expires_at: new Date(Date.now() + 600000).toISOString(),
        redirect_uri: "https://example.com/callback",
      });
      void code; // Used for test setup

      // Exchange code for tokens with matching organization parameter
      const response = await client.oauth.token.$post(
        // @ts-expect-error - testClient type requires both form and json
        {
          form: {
            grant_type: "authorization_code",
            client_id: "clientId",
            client_secret: "clientSecret",
            code: "test-org-param-code",
            redirect_uri: "https://example.com/callback",
            organization: organization.id, // This should match the login session
          },
        },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as TokenResponse;
      expect(body).toHaveProperty("access_token");
      expect(body).toHaveProperty("token_type", "Bearer");

      // Clean up
      await env.data.organizations.remove("tenantId", organization.id);
      await env.data.users.remove("tenantId", user.user_id);
    });

    it("should reject token request when organization parameter does not match login session", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      // Create two organizations
      const organization1 = await env.data.organizations.create("tenantId", {
        name: "Organization 1",
        display_name: "Org 1",
      });

      const organization2 = await env.data.organizations.create("tenantId", {
        name: "Organization 2",
        display_name: "Org 2",
      });

      // Create a user
      const user = await env.data.users.create("tenantId", {
        user_id: "email|token-org-mismatch-user",
        email: "token-org-mismatch@example.com",
        provider: "email",
        connection: "email",
        email_verified: true,
        is_social: false,
      });

      // Create a login session with organization1 in authParams
      const loginSession = await env.data.loginSessions.create("tenantId", {
        authParams: {
          client_id: "clientId",
          audience: "https://example.com/api",
          scope: "openid profile",
          organization: organization1.id,
          redirect_uri: "https://example.com/callback",
          response_type: AuthorizationResponseType.CODE,
        },
        expires_at: new Date(Date.now() + 600000).toISOString(),
        csrf_token: "test-csrf-token-org-mismatch",
      });

      // Create an authorization code
      const code = await env.data.codes.create("tenantId", {
        code_id: "test-org-mismatch-code",
        user_id: user.user_id,
        code_type: "authorization_code",
        login_id: loginSession.id,
        expires_at: new Date(Date.now() + 600000).toISOString(),
        redirect_uri: "https://example.com/callback",
      });
      void code; // Used for test setup

      // Try to exchange code with different organization parameter
      const response = await client.oauth.token.$post(
        // @ts-expect-error - testClient type requires both form and json
        {
          form: {
            grant_type: "authorization_code",
            client_id: "clientId",
            client_secret: "clientSecret",
            code: "test-org-mismatch-code",
            redirect_uri: "https://example.com/callback",
            organization: organization2.id, // This does NOT match the login session
          },
        },
      );

      expect(response.status).toBe(400);
      const body = (await response.json()) as ErrorResponse;
      expect(body).toEqual({
        error: "invalid_request",
        error_description:
          "Organization parameter does not match login session organization",
      });

      // Clean up
      await env.data.organizations.remove("tenantId", organization1.id);
      await env.data.organizations.remove("tenantId", organization2.id);
      await env.data.users.remove("tenantId", user.user_id);
    });

    it("should accept organization parameter when login session has no organization (Auth0 compatibility)", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      // Create an organization
      const organization = await env.data.organizations.create("tenantId", {
        name: "Requested Organization",
        display_name: "Requested Org",
      });

      // Create a user
      const user = await env.data.users.create("tenantId", {
        user_id: "email|token-no-org-user",
        email: "token-no-org@example.com",
        provider: "email",
        connection: "email",
        email_verified: true,
        is_social: false,
      });

      // Create a login session WITHOUT organization in authParams
      const loginSession = await env.data.loginSessions.create("tenantId", {
        authParams: {
          client_id: "clientId",
          audience: "https://example.com/api",
          scope: "openid profile",
          redirect_uri: "https://example.com/callback",
          response_type: AuthorizationResponseType.CODE,
          // NO organization parameter
        },
        expires_at: new Date(Date.now() + 600000).toISOString(),
        csrf_token: "test-csrf-token-no-org",
      });

      // Create an authorization code
      const code = await env.data.codes.create("tenantId", {
        code_id: "test-no-org-code",
        user_id: user.user_id,
        code_type: "authorization_code",
        login_id: loginSession.id,
        expires_at: new Date(Date.now() + 600000).toISOString(),
        redirect_uri: "https://example.com/callback",
      });
      void code; // Used for test setup

      // Exchange code with organization parameter when login session has no organization
      // This should now be allowed (Auth0 compatibility)
      const response = await client.oauth.token.$post(
        // @ts-expect-error - testClient type requires both form and json
        {
          form: {
            grant_type: "authorization_code",
            client_id: "clientId",
            client_secret: "clientSecret",
            code: "test-no-org-code",
            redirect_uri: "https://example.com/callback",
            organization: organization.id, // This should now be accepted
          },
        },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as TokenResponse;
      expect(body).toMatchObject({
        access_token: expect.any(String),
        id_token: expect.any(String),
        token_type: "Bearer",
        expires_in: expect.any(Number),
      });

      // Clean up
      await env.data.organizations.remove("tenantId", organization.id);
      await env.data.users.remove("tenantId", user.user_id);
    });

    it("should work normally when no organization parameter is provided (backward compatibility)", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      // Create a user
      const user = await env.data.users.create("tenantId", {
        user_id: "email|token-backward-compat-user",
        email: "token-backward-compat@example.com",
        provider: "email",
        connection: "email",
        email_verified: true,
        is_social: false,
      });

      // Create a login session without organization
      const loginSession = await env.data.loginSessions.create("tenantId", {
        authParams: {
          client_id: "clientId",
          audience: "https://example.com/api",
          scope: "openid profile",
          redirect_uri: "https://example.com/callback",
          response_type: AuthorizationResponseType.CODE,
        },
        expires_at: new Date(Date.now() + 600000).toISOString(),
        csrf_token: "test-csrf-token-backward-compat",
      });

      // Create an authorization code
      const code = await env.data.codes.create("tenantId", {
        code_id: "test-backward-compat-code",
        user_id: user.user_id,
        code_type: "authorization_code",
        login_id: loginSession.id,
        expires_at: new Date(Date.now() + 600000).toISOString(),
        redirect_uri: "https://example.com/callback",
      });
      void code; // Used for test setup

      // Exchange code for tokens without organization parameter - should work normally
      const response = await client.oauth.token.$post(
        // @ts-expect-error - testClient type requires both form and json
        {
          form: {
            grant_type: "authorization_code",
            client_id: "clientId",
            client_secret: "clientSecret",
            code: "test-backward-compat-code",
            redirect_uri: "https://example.com/callback",
            // NO organization parameter
          },
        },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as TokenResponse;
      expect(body).toHaveProperty("access_token");
      expect(body).toHaveProperty("token_type", "Bearer");

      // Clean up
      await env.data.users.remove("tenantId", user.user_id);
    });
  });

  describe("permissions in JWT tokens", () => {
    describe("authorization_code flow with access_token_authz", () => {
      it("should include permissions in JWT token when resource server has enforce_policies=true and token_dialect=access_token_authz", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        // Create a resource server with RBAC enabled and access_token_authz dialect
        const resourceServer = await env.data.resourceServers.create(
          "tenantId",
          {
            name: "Test API with Permissions",
            identifier: "https://permissions-test-api.example.com",
            scopes: [
              { value: "read:users", description: "Read users" },
              { value: "write:users", description: "Write users" },
              { value: "delete:users", description: "Delete users" },
            ],
            options: {
              enforce_policies: true, // RBAC enabled
              token_dialect: "access_token_authz", // Should include permissions in token
            },
          },
        );

        // Create a user
        const user = await env.data.users.create("tenantId", {
          user_id: "email|permissions-test-user",
          email: "permissions-test@example.com",
          provider: "email",
          connection: "email",
          email_verified: true,
          is_social: false,
          name: "Permissions Test User",
        });

        // Give user direct permissions
        await env.data.userPermissions.create("tenantId", user.user_id, {
          user_id: user.user_id,
          resource_server_identifier:
            "https://permissions-test-api.example.com",
          permission_name: "read:users",
        });

        await env.data.userPermissions.create("tenantId", user.user_id, {
          user_id: user.user_id,
          resource_server_identifier:
            "https://permissions-test-api.example.com",
          permission_name: "write:users",
        });

        // Create a login session
        const loginSession = await env.data.loginSessions.create("tenantId", {
          authParams: {
            client_id: "clientId",
            audience: "https://permissions-test-api.example.com",
            scope: "read:users write:users delete:users", // Request all scopes
            redirect_uri: "https://example.com/callback",
            response_type: AuthorizationResponseType.CODE,
          },
          expires_at: new Date(Date.now() + 600000).toISOString(),
          csrf_token: "test-csrf-token-permissions",
        });

        // Create an authorization code
        const code = await env.data.codes.create("tenantId", {
          code_id: "test-permissions-code",
          user_id: user.user_id,
          code_type: "authorization_code",
          login_id: loginSession.id,
          expires_at: new Date(Date.now() + 600000).toISOString(),
          redirect_uri: "https://example.com/callback",
        });

        // Exchange code for tokens
        const response = await client.oauth.token.$post(
          // @ts-expect-error - testClient type requires both form and json
          {
            form: {
              grant_type: "authorization_code",
              client_id: "clientId",
              client_secret: "clientSecret",
              code: "test-permissions-code",
              redirect_uri: "https://example.com/callback",
            },
          },
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as TokenResponse;

        expect(body).toHaveProperty("access_token");
        expect(body).toHaveProperty("token_type", "Bearer");

        // Parse the access token to check permissions
        const accessToken = parseJWT(body.access_token);
        const payload = accessToken?.payload as any;

        expect(accessToken).not.toBeNull();
        expect(payload.sub).toBe(user.user_id);
        expect(payload.aud).toBe("https://permissions-test-api.example.com");

        // Verify permissions are included in the token
        expect(payload.permissions).toBeDefined();
        expect(payload.permissions).toEqual(
          expect.arrayContaining(["read:users", "write:users"]),
        );
        // User should not have delete:users permission since it wasn't granted
        expect(payload.permissions).not.toContain("delete:users");

        // For access_token_authz dialect, scopes should be empty
        expect(payload.scope).toBe("");

        // Clean up
        await env.data.resourceServers.remove("tenantId", resourceServer.id!);
        await env.data.users.remove("tenantId", user.user_id);
      });

      it("should NOT include permissions when token_dialect is access_token (default) even with RBAC enabled", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        // Create a resource server with RBAC enabled but default token_dialect
        const resourceServer = await env.data.resourceServers.create(
          "tenantId",
          {
            name: "Test API with Scopes",
            identifier: "https://scopes-test-api.example.com",
            scopes: [
              { value: "read:users", description: "Read users" },
              { value: "write:users", description: "Write users" },
            ],
            options: {
              enforce_policies: true, // RBAC enabled
              token_dialect: "access_token", // Auth0: NO permissions with default dialect
            },
          },
        );

        // Create a user
        const user = await env.data.users.create("tenantId", {
          user_id: "email|scopes-test-user",
          email: "scopes-test@example.com",
          provider: "email",
          connection: "email",
          email_verified: true,
          is_social: false,
          name: "Scopes Test User",
        });

        // Give user permissions
        await env.data.userPermissions.create("tenantId", user.user_id, {
          user_id: user.user_id,
          resource_server_identifier: "https://scopes-test-api.example.com",
          permission_name: "read:users",
        });

        // Create a login session
        const loginSession = await env.data.loginSessions.create("tenantId", {
          authParams: {
            client_id: "clientId",
            audience: "https://scopes-test-api.example.com",
            scope: "read:users write:users",
            redirect_uri: "https://example.com/callback",
            response_type: AuthorizationResponseType.CODE,
          },
          expires_at: new Date(Date.now() + 600000).toISOString(),
          csrf_token: "test-csrf-token-scopes",
        });

        // Create an authorization code
        const code = await env.data.codes.create("tenantId", {
          code_id: "test-scopes-code",
          user_id: user.user_id,
          code_type: "authorization_code",
          login_id: loginSession.id,
          expires_at: new Date(Date.now() + 600000).toISOString(),
          redirect_uri: "https://example.com/callback",
        });

        // Exchange code for tokens
        const response = await client.oauth.token.$post(
          // @ts-expect-error - testClient type requires both form and json
          {
            form: {
              grant_type: "authorization_code",
              client_id: "clientId",
              client_secret: "clientSecret",
              code: "test-scopes-code",
              redirect_uri: "https://example.com/callback",
            },
          },
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as TokenResponse;

        // Parse the access token
        const accessToken = parseJWT(body.access_token);
        const payload = accessToken?.payload as any;

        expect(accessToken).not.toBeNull();

        // Auth0 behavior: permissions are ONLY included when token_dialect is access_token_authz
        // With default token_dialect (access_token), permissions should NOT be in the token
        expect(payload.permissions).toBeUndefined();
        expect(payload.scope).toBe("read:users"); // Only the scope user has permission for

        // Clean up
        await env.data.resourceServers.remove("tenantId", resourceServer.id!);
        await env.data.users.remove("tenantId", user.user_id);
      });
    });

    describe("client_credentials flow with access_token_authz", () => {
      it("should include permissions in JWT token for client_credentials grant", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        // Create a resource server with access_token_authz dialect
        const resourceServer = await env.data.resourceServers.create(
          "tenantId",
          {
            identifier: "https://client-permissions-api.example.com",
            name: "Client Permissions API",
            scopes: [
              { value: "read:data", description: "Read data" },
              { value: "write:data", description: "Write data" },
            ],
            options: {
              enforce_policies: true, // RBAC enabled
              token_dialect: "access_token_authz", // Should include permissions
            },
          },
        );

        // Create a client grant
        await env.data.clientGrants.create("tenantId", {
          client_id: "clientId",
          audience: "https://client-permissions-api.example.com",
          scope: ["read:data", "write:data"],
        });

        // Make client_credentials token request
        const response = await client.oauth.token.$post(
          // @ts-expect-error - testClient type requires both form and json
          {
            form: {
              grant_type: "client_credentials",
              client_id: "clientId",
              client_secret: "clientSecret",
              audience: "https://client-permissions-api.example.com",
              scope: "read:data write:data",
            },
          },
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as TokenResponse;

        // Parse the access token
        const accessToken = parseJWT(body.access_token);
        const payload = accessToken?.payload as any;

        expect(accessToken).not.toBeNull();
        expect(payload.sub).toBe("clientId");
        expect(payload.aud).toBe("https://client-permissions-api.example.com");

        // Verify permissions are included for client_credentials
        expect(payload.permissions).toBeDefined();
        expect(payload.permissions).toEqual(
          expect.arrayContaining(["read:data", "write:data"]),
        );

        // Auth0 behavior: scopes should also be in the scope claim
        expect(payload.scope).toBe("read:data write:data");

        // Clean up
        await env.data.resourceServers.remove("tenantId", resourceServer.id!);
      });
    });
  });

  describe("Content Type Support", () => {
    describe("application/json", () => {
      it("should accept client_credentials grant with JSON payload", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        const response = await client.oauth.token.$post(
          // @ts-expect-error - testClient type requires both form and json
          {
            json: {
              grant_type: "client_credentials",
              client_id: "clientId",
              client_secret: "clientSecret",
              audience: "https://example.com",
            },
          },
          {
            headers: {
              "tenant-id": "tenantId",
              "Content-Type": "application/json",
            },
          },
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as TokenResponse;

        expect(body.access_token).toBeDefined();
        expect(body.token_type).toBe("Bearer");

        const accessToken = parseJWT(body.access_token);
        expect(accessToken?.payload).toMatchObject({
          sub: "clientId",
          iss: "http://localhost:3000/",
          aud: "https://example.com",
        });
      });

      it("should accept client_credentials grant with basic auth and JSON payload", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        const response = await client.oauth.token.$post(
          // @ts-expect-error - testClient type requires both form and json
          {
            json: {
              grant_type: "client_credentials",
              audience: "https://example.com",
            },
          },
          {
            headers: {
              "tenant-id": "tenantId",
              "Content-Type": "application/json",
              authorization: "Basic " + btoa("clientId:clientSecret"),
            },
          },
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as TokenResponse;

        expect(body.access_token).toBeDefined();
        expect(body.token_type).toBe("Bearer");

        const accessToken = parseJWT(body.access_token);
        expect(accessToken?.payload).toMatchObject({
          sub: "clientId",
          iss: "http://localhost:3000/",
          aud: "https://example.com",
        });
      });

      it("should accept authorization_code grant with JSON payload", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        // Create session and login session with proper foreign key relationships
        const { loginSession } = await createSessions(env.data);

        // Update the login session with the required auth params
        await env.data.loginSessions.update("tenantId", loginSession.id, {
          authParams: {
            client_id: "clientId",
            username: "foo@example.com",
            scope: "openid offline_access", // Include offline_access to get refresh token
            audience: "http://example.com",
            redirect_uri: "http://example.com/callback",
          },
        });

        await env.data.codes.create("tenantId", {
          code_type: "authorization_code",
          user_id: "email|userId",
          code_id: "test-code-123",
          login_id: loginSession.id,
          expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
        });

        const response = await client.oauth.token.$post(
          // @ts-expect-error - testClient type requires both form and json
          {
            json: {
              grant_type: "authorization_code",
              client_id: "clientId",
              code: "test-code-123",
              redirect_uri: "http://example.com/callback",
              client_secret: "clientSecret",
            },
          },
          {
            headers: {
              "tenant-id": "tenantId",
              "Content-Type": "application/json",
            },
          },
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as TokenResponse;

        expect(body.access_token).toBeDefined();
        expect(body.id_token).toBeDefined();
        expect(body.refresh_token).toBeDefined();
        expect(body.token_type).toBe("Bearer");
      });

      it("should accept refresh_token grant with JSON payload", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        // Create refresh token directly (following existing refresh token test pattern)
        const idle_expires_at = new Date(
          Date.now() + 1000 * 60 * 60,
        ).toISOString();

        await env.data.refreshTokens.create("tenantId", {
          id: "testRefreshToken",
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

        // Test refresh token with JSON
        const response = await client.oauth.token.$post(
          // @ts-expect-error - testClient type requires both form and json
          {
            json: {
              grant_type: "refresh_token",
              client_id: "clientId",
              refresh_token: "testRefreshToken",
            },
          },
          {
            headers: {
              "tenant-id": "tenantId",
              "Content-Type": "application/json",
            },
          },
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as TokenResponse;

        expect(body.access_token).toBeDefined();
        expect(body.id_token).toBeDefined();
        expect(body.refresh_token).toBeDefined();
        expect(body.token_type).toBe("Bearer");
      });
    });

    describe("application/x-www-form-urlencoded", () => {
      it("should continue to work with form data (regression test)", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        const response = await client.oauth.token.$post(
          // @ts-expect-error - testClient type requires both form and json
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

        expect(body.access_token).toBeDefined();
        expect(body.token_type).toBe("Bearer");

        const accessToken = parseJWT(body.access_token);
        expect(accessToken?.payload).toMatchObject({
          sub: "clientId",
          iss: "http://localhost:3000/",
          aud: "https://example.com",
        });
      });
    });

    describe("Error cases", () => {
      it("should require client_id in JSON requests", async () => {
        const { oauthApp, env } = await getTestServer();
        const client = testClient(oauthApp, env);

        const response = await client.oauth.token.$post(
          // @ts-expect-error - testClient type requires both form and json
          {
            json: {
              grant_type: "client_credentials",
              client_secret: "clientSecret",
              audience: "https://example.com",
              // Missing client_id
            },
          },
          {
            headers: {
              "tenant-id": "tenantId",
              "Content-Type": "application/json",
            },
          },
        );

        expect(response.status).toBe(400);
        const body = await response.text();
        expect(body).toContain("client_id is required");
      });
    });
  });
});
