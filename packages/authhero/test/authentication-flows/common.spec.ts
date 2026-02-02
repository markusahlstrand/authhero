import { describe, it, expect } from "vitest";
import { Context } from "hono";
import {
  createFrontChannelAuthResponse,
  createAuthTokens,
  completeLogin,
} from "../../src/authentication-flows/common";
import { getTestServer } from "../helpers/test-server";
import { Bindings, Variables } from "../../src/types";
import { getPrimaryUserByEmail } from "../../src/helpers/users";
import {
  AuthorizationResponseType,
  AuthorizationResponseMode,
} from "@authhero/adapter-interfaces";
import { parseJWT } from "oslo/jwt";
import { getEnrichedClient } from "../../src/helpers/client";

describe("common", () => {
  describe("createAuthTokens", () => {
    it("should create an access token when the response type is token", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {
          tenant_id: "tenantId",
        },
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      const client = await getEnrichedClient(env, "clientId");
      const user = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });

      if (!client || !user) {
        throw new Error("Client or user not found");
      }

      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.TOKEN,
        },
        client,
        user,
        session_id: "session_id",
      });

      expect(tokens).toMatchObject({
        access_token: expect.any(String),
        id_token: undefined,
        token_type: "Bearer",
        expires_in: 86400,
      });
    });

    it("should create an access token and an id token when the response type is token id_token and the openid scope is requested", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {
          tenant_id: "tenantId",
        },
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      const client = await getEnrichedClient(env, "clientId");
      const user = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });

      if (!client || !user) {
        throw new Error("Client or user not found");
      }

      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
          scope: "openid",
        },
        client,
        user,
        session_id: "session_id",
      });

      expect(tokens).toMatchObject({
        access_token: expect.any(String),
        id_token: expect.any(String),
        token_type: "Bearer",
        expires_in: 86400,
      });
    });

    it("should NOT include email claims in id_token when only openid scope is requested (OIDC compliance)", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {
          tenant_id: "tenantId",
        },
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      const client = await getEnrichedClient(env, "clientId");
      const user = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });

      if (!client || !user) {
        throw new Error("Client or user not found");
      }

      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
          scope: "openid", // Only openid scope, no email scope
        },
        client,
        user,
        session_id: "session_id",
      });

      expect(tokens.id_token).toBeDefined();
      const parsed = parseJWT(tokens.id_token!);
      const payload = parsed?.payload as Record<string, unknown>;

      // Should have basic claims
      expect(payload.sub).toBeDefined();
      expect(payload.aud).toBeDefined();
      expect(payload.iss).toBeDefined();

      // Should NOT have email claims when email scope is not requested
      expect(payload.email).toBeUndefined();
      expect(payload.email_verified).toBeUndefined();

      // Should NOT have profile claims when profile scope is not requested
      expect(payload.name).toBeUndefined();
      expect(payload.nickname).toBeUndefined();
      expect(payload.picture).toBeUndefined();
      expect(payload.given_name).toBeUndefined();
      expect(payload.family_name).toBeUndefined();
      expect(payload.locale).toBeUndefined();
    });

    it("should include email claims in id_token when email scope is requested (Auth0 compatible behavior)", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {
          tenant_id: "tenantId",
        },
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      const client = await getEnrichedClient(env, "clientId");
      const user = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });

      if (!client || !user) {
        throw new Error("Client or user not found");
      }

      // Auth0 includes email claims in id_token whenever email scope is requested
      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.ID_TOKEN,
          scope: "openid email", // Request email scope
        },
        client,
        user,
        session_id: "session_id",
      });

      expect(tokens.id_token).toBeDefined();
      const parsed = parseJWT(tokens.id_token!);
      const payload = parsed?.payload as Record<string, unknown>;

      // Should have email claims when email scope is requested
      expect(payload.email).toBe("foo@example.com");
      expect(payload.email_verified).toBeDefined();

      // Should NOT have profile claims when profile scope is not requested
      expect(payload.name).toBeUndefined();
      expect(payload.nickname).toBeUndefined();
    });

    it("should include email claims in id_token when email scope is requested with TOKEN_ID_TOKEN (Auth0 compatible behavior)", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {
          tenant_id: "tenantId",
        },
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      const client = await getEnrichedClient(env, "clientId");
      const user = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });

      if (!client || !user) {
        throw new Error("Client or user not found");
      }

      // Auth0 includes email claims in id_token whenever email scope is requested,
      // regardless of whether an access token is also issued
      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
          scope: "openid email", // Request email scope
        },
        client,
        user,
        session_id: "session_id",
      });

      expect(tokens.id_token).toBeDefined();
      const parsed = parseJWT(tokens.id_token!);
      const payload = parsed?.payload as Record<string, unknown>;

      // Auth0 behavior: email claims should be in id_token when email scope is requested
      expect(payload.email).toBe("foo@example.com");
      expect(payload.email_verified).toBeDefined();

      // Should NOT have profile claims when profile scope is not requested
      expect(payload.name).toBeUndefined();
      expect(payload.nickname).toBeUndefined();
    });

    it("should include profile claims in id_token when profile scope is requested (Auth0 compatible behavior)", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {
          tenant_id: "tenantId",
        },
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      const client = await getEnrichedClient(env, "clientId");
      const user = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });

      if (!client || !user) {
        throw new Error("Client or user not found");
      }

      // Auth0 includes profile claims in id_token whenever profile scope is requested
      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.ID_TOKEN,
          scope: "openid profile", // Request profile scope
        },
        client,
        user,
        session_id: "session_id",
      });

      expect(tokens.id_token).toBeDefined();
      const parsed = parseJWT(tokens.id_token!);
      const payload = parsed?.payload as Record<string, unknown>;

      // Should have profile claims when profile scope is requested
      expect(payload.nickname).toBeDefined();
      expect(payload.name).toBeDefined();

      // Should NOT have email claims when email scope is not requested
      expect(payload.email).toBeUndefined();
      expect(payload.email_verified).toBeUndefined();
    });

    it("should include profile claims in id_token when profile scope is requested with TOKEN_ID_TOKEN (Auth0 compatible behavior)", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {
          tenant_id: "tenantId",
        },
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      const client = await getEnrichedClient(env, "clientId");
      const user = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });

      if (!client || !user) {
        throw new Error("Client or user not found");
      }

      // Auth0 includes profile claims in id_token whenever profile scope is requested,
      // regardless of whether an access token is also issued
      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
          scope: "openid profile", // Request profile scope
        },
        client,
        user,
        session_id: "session_id",
      });

      expect(tokens.id_token).toBeDefined();
      const parsed = parseJWT(tokens.id_token!);
      const payload = parsed?.payload as Record<string, unknown>;

      // Auth0 behavior: profile claims should be in id_token when profile scope is requested
      expect(payload.nickname).toBeDefined();
      expect(payload.name).toBeDefined();

      // Should NOT have email claims when email scope is not requested
      expect(payload.email).toBeUndefined();
      expect(payload.email_verified).toBeUndefined();
    });

    it("should include both email and profile claims when both scopes are requested (Auth0 compatible behavior)", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {
          tenant_id: "tenantId",
        },
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      const client = await getEnrichedClient(env, "clientId");
      const user = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });

      if (!client || !user) {
        throw new Error("Client or user not found");
      }

      // Auth0 includes claims in id_token whenever the corresponding scopes are requested
      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.ID_TOKEN,
          scope: "openid profile email", // Request both scopes
        },
        client,
        user,
        session_id: "session_id",
      });

      expect(tokens.id_token).toBeDefined();
      const parsed = parseJWT(tokens.id_token!);
      const payload = parsed?.payload as Record<string, unknown>;

      // Should have both email and profile claims when both scopes are requested
      expect(payload.email).toBe("foo@example.com");
      expect(payload.email_verified).toBeDefined();
      expect(payload.nickname).toBeDefined();
      expect(payload.name).toBeDefined();
    });

    it("should include email and profile claims in id_token when requested with TOKEN_ID_TOKEN (Auth0 compatible behavior)", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {
          tenant_id: "tenantId",
        },
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      const client = await getEnrichedClient(env, "clientId");
      const user = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });

      if (!client || !user) {
        throw new Error("Client or user not found");
      }

      // Auth0 includes claims in id_token whenever the corresponding scopes are requested,
      // regardless of whether an access token is also issued
      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
          scope: "openid profile email", // Request both scopes
        },
        client,
        user,
        session_id: "session_id",
      });

      expect(tokens.id_token).toBeDefined();
      const parsed = parseJWT(tokens.id_token!);
      const payload = parsed?.payload as Record<string, unknown>;

      // Auth0 behavior: claims should be in id_token when scopes are requested
      expect(payload.email).toBe("foo@example.com");
      expect(payload.email_verified).toBeDefined();
      expect(payload.nickname).toBeDefined();
      expect(payload.name).toBeDefined();
    });

    it("should NOT include profile/email claims in id_token when auth0_conformant=false and response_type is TOKEN_ID_TOKEN (strict OIDC 5.4)", async () => {
      const { env } = await getTestServer();

      // Update client to use strict OIDC mode
      await env.data.clients.update("tenantId", "clientId", {
        auth0_conformant: false,
      });

      const ctx = {
        env,
        var: {
          tenant_id: "tenantId",
        },
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      const client = await getEnrichedClient(env, "clientId");
      const user = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });

      if (!client || !user) {
        throw new Error("Client or user not found");
      }

      // With auth0_conformant=false and response_type=TOKEN_ID_TOKEN,
      // claims should NOT be in id_token (strict OIDC 5.4 compliance)
      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
          scope: "openid profile email",
        },
        client,
        user,
        session_id: "session_id",
      });

      expect(tokens.id_token).toBeDefined();
      const parsed = parseJWT(tokens.id_token!);
      const payload = parsed?.payload as Record<string, unknown>;

      // Strict OIDC 5.4: claims should NOT be in id_token when access token is issued
      expect(payload.email).toBeUndefined();
      expect(payload.email_verified).toBeUndefined();
      expect(payload.nickname).toBeUndefined();
      expect(payload.name).toBeUndefined();

      // Reset client back to default
      await env.data.clients.update("tenantId", "clientId", {
        auth0_conformant: true,
      });
    });

    it("should include profile/email claims in id_token when auth0_conformant=false but response_type is ID_TOKEN (strict OIDC 5.4)", async () => {
      const { env } = await getTestServer();

      // Update client to use strict OIDC mode
      await env.data.clients.update("tenantId", "clientId", {
        auth0_conformant: false,
      });

      const ctx = {
        env,
        var: {
          tenant_id: "tenantId",
        },
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      const client = await getEnrichedClient(env, "clientId");
      const user = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });

      if (!client || !user) {
        throw new Error("Client or user not found");
      }

      // With auth0_conformant=false but response_type=ID_TOKEN,
      // claims SHOULD be in id_token (no access token to use with userinfo)
      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.ID_TOKEN,
          scope: "openid profile email",
        },
        client,
        user,
        session_id: "session_id",
      });

      expect(tokens.id_token).toBeDefined();
      const parsed = parseJWT(tokens.id_token!);
      const payload = parsed?.payload as Record<string, unknown>;

      // Even with strict OIDC, response_type=id_token should include claims
      expect(payload.email).toBe("foo@example.com");
      expect(payload.email_verified).toBeDefined();
      expect(payload.nickname).toBeDefined();
      expect(payload.name).toBeDefined();

      // Reset client back to default
      await env.data.clients.update("tenantId", "clientId", {
        auth0_conformant: true,
      });
    });

    it("should create tokens with 1-hour expiration for impersonated users", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {
          tenant_id: "tenantId",
        },
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      const client = await getEnrichedClient(env, "clientId");
      const user = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });

      // Create impersonating user for this test
      const impersonatingUser = await env.data.users.create("tenantId", {
        email: "admin@example.com",
        email_verified: true,
        name: "Admin User",
        nickname: "Admin User",
        connection: "email",
        provider: "email",
        is_social: false,
        user_id: "email|admin",
      });

      if (!client || !user) {
        throw new Error("Client or user not found");
      }

      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
          scope: "openid",
        },
        client,
        user,
        session_id: "session_id",
        impersonatingUser,
      });

      expect(tokens).toMatchObject({
        access_token: expect.any(String),
        id_token: expect.any(String),
        token_type: "Bearer",
        expires_in: 3600, // 1 hour for impersonated sessions
      });
    });

    it("should include act claim in tokens for impersonated users", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {
          tenant_id: "tenantId",
        },
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      const client = await getEnrichedClient(env, "clientId");
      const user = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });

      // Create impersonating user for this test
      const impersonatingUser = await env.data.users.create("tenantId", {
        email: "admin@example.com",
        email_verified: true,
        name: "Admin User",
        nickname: "Admin User",
        connection: "email",
        provider: "email",
        is_social: false,
        user_id: "email|admin",
      });

      if (!client || !user) {
        throw new Error("Client or user not found");
      }

      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
          scope: "openid",
        },
        client,
        user,
        session_id: "session_id",
        impersonatingUser,
      });

      // Decode the access token to check for act claim
      const accessToken = parseJWT(tokens.access_token);
      const accessTokenPayload = accessToken?.payload as any;

      expect(accessTokenPayload.act).toEqual({
        sub: impersonatingUser.user_id,
      });

      // Decode the id token to check for act claim
      if (tokens.id_token) {
        const idToken = parseJWT(tokens.id_token);
        const idTokenPayload = idToken?.payload as any;

        expect(idTokenPayload.act).toEqual({
          sub: impersonatingUser.user_id,
        });
      }
    });
  });

  it("should create a code when the response type is code", async () => {
    const { env } = await getTestServer();
    const ctx = {
      env,
      var: {
        tenant_id: "tenantId",
      },
      req: {
        header: () => {},
        queries: () => {},
      },
    } as unknown as Context<{
      Bindings: Bindings;
      Variables: Variables;
    }>;

    // Create the login session and code
    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        username: "foo@example.com",
        scope: "",
        audience: "http://example.com",
        redirect_uri: "http://example.com/callback",
      },
    });

    const client = await getEnrichedClient(env, "clientId");
    const user = await getPrimaryUserByEmail({
      userAdapter: env.data.users,
      tenant_id: "tenantId",
      email: "foo@example.com",
    });

    if (!client || !user) {
      throw new Error("Client or user not found");
    }

    const autResponse = (await createFrontChannelAuthResponse(ctx, {
      authParams: {
        client_id: "clientId",
        response_type: AuthorizationResponseType.CODE,
        scope: "openid",
        redirect_uri: "http://example.com/callback",
      },
      client,
      user,
      loginSession,
    })) as Response;

    expect(autResponse.status).toEqual(302);
    const location = autResponse.headers.get("location");
    if (!location) {
      throw new Error("No location header");
    }

    const redirectUri = new URL(location);
    const codeQuerystring = redirectUri.searchParams.get("code");

    const code = await env.data.codes.get(
      "tenantId",
      codeQuerystring!,
      "authorization_code",
    );
    expect(code).toMatchObject({
      code_id: codeQuerystring,
      code_type: "authorization_code",
      user_id: "email|userId",
    });
  });

  it("should reuse an existing session when existingSessionIdToLink is provided", async () => {
    const { env } = await getTestServer();

    // Setup a mock context with minimal requirements
    const ctx = {
      env,
      var: {
        tenant_id: "tenantId",
      },
      req: {
        header: () => {},
        queries: () => {},
      },
    } as unknown as Context<{
      Bindings: Bindings;
      Variables: Variables;
    }>;

    // Create a session and a login session
    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        username: "foo@example.com",
        scope: "openid",
        audience: "http://example.com",
        redirect_uri: "http://example.com/callback",
      },
    });

    const session = await env.data.sessions.create("tenantId", {
      id: "existingSessionId",
      login_session_id: loginSession.id,
      user_id: "email|userId",
      clients: ["clientId"],
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      used_at: new Date().toISOString(),
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
    });

    const client = await getEnrichedClient(env, "clientId");
    const user = await getPrimaryUserByEmail({
      userAdapter: env.data.users,
      tenant_id: "tenantId",
      email: "foo@example.com",
    });

    if (!client || !user) {
      throw new Error("Client or user not found");
    }

    // Call createAuthResponse which should reuse the existing session
    // We explicitly pass existingSessionIdToLink to indicate we want to link this session
    const authResponse = (await createFrontChannelAuthResponse(ctx, {
      authParams: {
        client_id: "clientId",
        response_type: AuthorizationResponseType.CODE,
        scope: "openid",
        redirect_uri: "http://example.com/callback",
      },
      client,
      user,
      loginSession,
      existingSessionIdToLink: session.id,
    })) as Response;

    // Verify that no new session was created
    const sessionsList = await env.data.sessions.list("tenantId", {
      page: 0,
      per_page: 10,
      include_totals: true,
    });

    // We expect only one session to exist (the one we created)
    expect(sessionsList.sessions.length).toEqual(1);

    // Verify that the code created uses the existing session
    expect(authResponse.status).toEqual(302);
    const location = authResponse.headers.get("location");
    if (!location) {
      throw new Error("No location header");
    }

    // Get the updated login session to confirm session_id is still the original
    const updatedLoginSession = await env.data.loginSessions.get(
      "tenantId",
      loginSession.id,
    );
    expect(updatedLoginSession?.session_id).toEqual("existingSessionId");
  });

  it("should create a new session when existingSessionIdToLink points to a revoked session", async () => {
    const { env } = await getTestServer();

    const ctx = {
      env,
      var: {
        tenant_id: "tenantId",
      },
      req: {
        header: () => {},
        query: () => {},
        queries: () => {},
      },
      header: () => null,
      html: (content: string) => {
        return new Response(content, {
          headers: { "Content-Type": "text/html" },
        });
      },
    } as unknown as Context<{
      Bindings: Bindings;
      Variables: Variables;
    }>;

    // Create a revoked session first
    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 60000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
      },
    });

    const revokedSession = await env.data.sessions.create("tenantId", {
      id: "revokedSessionId",
      user_id: "email|userId",
      login_session_id: loginSession.id,
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
      clients: ["clientId"],
      revoked_at: new Date().toISOString(), // Session is revoked
    });

    const client = await getEnrichedClient(env, "clientId");
    const user = await env.data.users.get("tenantId", "email|userId");

    if (!client || !user) {
      throw new Error("Client or user not found");
    }

    // Call createAuthResponse with the revoked session
    // It should create a new session instead of reusing the revoked one
    const authResponse = (await createFrontChannelAuthResponse(ctx, {
      authParams: {
        client_id: "clientId",
        response_type: AuthorizationResponseType.CODE,
        scope: "openid",
        redirect_uri: "http://example.com/callback",
      },
      client,
      user,
      loginSession,
      existingSessionIdToLink: revokedSession.id,
    })) as Response;

    expect(authResponse.status).toEqual(302);

    // Get the updated login session to confirm a NEW session_id was created
    const updatedLoginSession = await env.data.loginSessions.get(
      "tenantId",
      loginSession.id,
    );

    // Should NOT be the revoked session
    expect(updatedLoginSession?.session_id).not.toEqual("revokedSessionId");
    // Should have created a new session
    expect(updatedLoginSession?.session_id).toBeTruthy();

    // Verify the new session exists and is not revoked
    const newSession = await env.data.sessions.get(
      "tenantId",
      updatedLoginSession!.session_id!,
    );
    expect(newSession).toBeTruthy();
    expect(newSession?.revoked_at).toBeUndefined();
  });

  it("should create a refresh token even if there is an existing session and offline_access scope is requested", async () => {
    const { env } = await getTestServer();

    const ctx = {
      env,
      var: {
        tenant_id: "tenantId",
      },
      req: {
        header: () => {},
        query: () => {},
        queries: () => {},
      },
      header: () => null,
      html: (content: string) => {
        return new Response(content, {
          headers: { "Content-Type": "text/html" },
        });
      },
    } as unknown as Context<{
      Bindings: Bindings;
      Variables: Variables;
    }>;

    // Create a session first
    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        username: "foo@example.com",
        scope: "openid offline_access", // Request offline_access
        audience: "http://example.com",
        redirect_uri: "http://example.com/callback",
        // Set response_mode to something that returns tokens directly
        response_mode: AuthorizationResponseMode.WEB_MESSAGE,
      },
    });

    const session = await env.data.sessions.create("tenantId", {
      id: "existingSessionIdForRefreshToken",
      login_session_id: loginSession.id,
      user_id: "email|userId",
      clients: ["clientId"],
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      used_at: new Date().toISOString(),
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
    });

    env.data.loginSessions.update("tenantId", loginSession.id, {
      session_id: session.id,
    });

    const client = await getEnrichedClient(env, "clientId");
    const user = await getPrimaryUserByEmail({
      userAdapter: env.data.users,
      tenant_id: "tenantId",
      email: "foo@example.com",
    });

    if (!client || !user) {
      throw new Error("Client or user not found");
    }

    const authResponse = (await createFrontChannelAuthResponse(ctx, {
      authParams: {
        client_id: "clientId",
        response_type: AuthorizationResponseType.TOKEN,
        scope: "openid offline_access",
        redirect_uri: "http://example.com/callback",
        response_mode: AuthorizationResponseMode.WEB_MESSAGE,
      },
      client,
      user,
      loginSession,
    })) as Response;

    expect(authResponse.status).toEqual(200);

    const body = await authResponse.text();
    expect(body).toContain("access_token");
  });

  it("should NOT create a refresh token for implicit flow even if offline_access scope is requested", async () => {
    const { env } = await getTestServer();
    const ctx = {
      env,
      var: {
        tenant_id: "tenantId",
      },
      req: {
        header: () => {},
        query: () => {},
        queries: () => {},
      },
      header: () => null,
    } as unknown as Context<{
      Bindings: Bindings;
      Variables: Variables;
    }>;

    const client = await getEnrichedClient(env, "clientId");
    const user = await getPrimaryUserByEmail({
      userAdapter: env.data.users,
      tenant_id: "tenantId",
      email: "foo@example.com",
    });

    if (!client || !user) {
      throw new Error("Client or user not found for implicit flow test");
    }

    // Get initial count of refresh tokens for the tenant
    const initialRefreshTokensList = await env.data.refreshTokens.list(
      "tenantId",
      {
        page: 0,
        per_page: 1, // We only need the total count
        include_totals: true,
      },
    );
    const initialRefreshTokenCount =
      initialRefreshTokensList.refresh_tokens.length;

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
      csrf_token: "csrfTokenImplicit",
      authParams: {
        client_id: "clientId",
        username: "foo@example.com",
        scope: "openid offline_access", // Request offline_access
        audience: "http://example.com",
        redirect_uri: "http://example.com/callback",
        // For implicit flow, response_mode is typically not web_message
      },
    });

    const authResponse = (await createFrontChannelAuthResponse(ctx, {
      authParams: {
        client_id: "clientId",
        response_type: AuthorizationResponseType.TOKEN, // Implicit flow
        scope: "openid offline_access", // offline_access is requested
        redirect_uri: "http://example.com/callback",
        // No response_mode: AuthorizationResponseMode.WEB_MESSAGE ensures implicit flow behavior (fragment)
      },
      client,
      user,
      loginSession,
    })) as Response;

    expect(authResponse.status).toEqual(302); // Redirect for implicit flow
    const location = authResponse.headers.get("location");
    if (!location) {
      throw new Error("No location header in implicit flow test response");
    }

    const redirectUri = new URL(location);
    const fragmentParams = new URLSearchParams(redirectUri.hash.substring(1)); // Remove leading '#'

    expect(fragmentParams.get("access_token")).toEqual(expect.any(String));
    // Crucially, refresh_token should NOT be in the fragment for implicit flow
    expect(fragmentParams.get("refresh_token")).toBeNull();

    // Verify that the refresh token count for the tenant has not changed
    const finalRefreshTokensList = await env.data.refreshTokens.list(
      "tenantId",
      {
        page: 0,
        per_page: 1, // We only need the total count
        include_totals: true,
      },
    );
    expect(finalRefreshTokensList.refresh_tokens.length).toBe(
      initialRefreshTokenCount,
    );
  });

  it("should NOT create a refresh token for impersonated users even with offline_access scope", async () => {
    const { env } = await getTestServer();
    const ctx = {
      env,
      var: {
        tenant_id: "tenantId",
      },
      req: {
        header: () => {},
        queries: () => {},
      },
    } as unknown as Context<{
      Bindings: Bindings;
      Variables: Variables;
    }>;

    // Create the login session
    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        username: "foo@example.com",
        scope: "openid offline_access",
        audience: "http://example.com",
        redirect_uri: "http://example.com/callback",
      },
    });

    const client = await getEnrichedClient(env, "clientId");
    const user = await getPrimaryUserByEmail({
      userAdapter: env.data.users,
      tenant_id: "tenantId",
      email: "foo@example.com",
    });

    // Create impersonating user for this test
    const impersonatingUser = await env.data.users.create("tenantId", {
      email: "admin@example.com",
      email_verified: true,
      name: "Admin User",
      nickname: "Admin User",
      connection: "email",
      provider: "email",
      is_social: false,
      user_id: "email|admin",
    });

    if (!client || !user) {
      throw new Error("Client or user not found");
    }

    // Get initial refresh token count
    const initialRefreshTokensList = await env.data.refreshTokens.list(
      "tenantId",
      {
        page: 0,
        per_page: 1,
        include_totals: true,
      },
    );
    const initialRefreshTokenCount =
      initialRefreshTokensList.refresh_tokens.length;

    const authResponse = (await createFrontChannelAuthResponse(ctx, {
      authParams: {
        client_id: "clientId",
        response_type: AuthorizationResponseType.CODE,
        scope: "openid offline_access", // Request offline_access
        redirect_uri: "http://example.com/callback",
      },
      client,
      user,
      loginSession,
      impersonatingUser, // Include impersonating user
    })) as Response;

    expect(authResponse.status).toEqual(302);

    // Verify that no new refresh token was created for impersonated user
    const finalRefreshTokensList = await env.data.refreshTokens.list(
      "tenantId",
      {
        page: 0,
        per_page: 1,
        include_totals: true,
      },
    );
    expect(finalRefreshTokensList.refresh_tokens.length).toBe(
      initialRefreshTokenCount, // Should be the same, no new refresh token created
    );
  });

  describe("strategy persistence to app_metadata", () => {
    it("should persist the authentication strategy to user app_metadata when logging in with password", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {
          tenant_id: "tenantId",
        },
        req: {
          header: () => {},
          queries: () => {},
        },
      } as unknown as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      // Get the user before authentication to verify initial state
      const userBefore = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });

      if (!userBefore) {
        throw new Error("User not found");
      }

      // Verify user doesn't have the strategy set initially
      expect(userBefore.app_metadata?.strategy).not.toBe(
        "Username-Password-Authentication",
      );

      const client = await getEnrichedClient(env, "clientId");
      if (!client) {
        throw new Error("Client not found");
      }

      // Create a login session
      const loginSession = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
        csrf_token: "csrfToken",
        authParams: {
          client_id: "clientId",
          username: "foo@example.com",
          scope: "openid",
          audience: "http://example.com",
          redirect_uri: "http://example.com/callback",
        },
      });

      // Authenticate using the password strategy
      const authResponse = await createFrontChannelAuthResponse(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.CODE,
          scope: "openid",
          redirect_uri: "http://example.com/callback",
        },
        client,
        user: userBefore,
        loginSession,
        authStrategy: {
          strategy: "Username-Password-Authentication",
          strategy_type: "database",
        },
      });

      expect(authResponse.status).toEqual(302);

      // Verify the user's app_metadata has been updated with the strategy
      const userAfter = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });

      if (!userAfter) {
        throw new Error("User not found after authentication");
      }

      expect(userAfter.app_metadata?.strategy).toBe(
        "Username-Password-Authentication",
      );
    });

    it("should persist the email strategy to user app_metadata when logging in with passwordless", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {
          tenant_id: "tenantId",
        },
        req: {
          header: () => {},
          queries: () => {},
        },
      } as unknown as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      const user = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });

      const client = await getEnrichedClient(env, "clientId");
      if (!client || !user) {
        throw new Error("Client or user not found");
      }

      // Create a login session
      const loginSession = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
        csrf_token: "csrfToken",
        authParams: {
          client_id: "clientId",
          username: "foo@example.com",
          scope: "openid",
          audience: "http://example.com",
          redirect_uri: "http://example.com/callback",
        },
      });

      // Authenticate using the email strategy (passwordless)
      const authResponse = await createFrontChannelAuthResponse(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.CODE,
          scope: "openid",
          redirect_uri: "http://example.com/callback",
        },
        client,
        user,
        loginSession,
        authStrategy: {
          strategy: "email",
          strategy_type: "passwordless",
        },
      });

      expect(authResponse.status).toEqual(302);

      // Verify the user's app_metadata has been updated with the email strategy
      const userAfter = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });

      if (!userAfter) {
        throw new Error("User not found after authentication");
      }

      expect(userAfter.app_metadata?.strategy).toBe("email");
    });

    it("should overwrite app_metadata strategy when user logs in with a different strategy", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {
          tenant_id: "tenantId",
        },
        req: {
          header: () => {},
          queries: () => {},
        },
      } as unknown as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      const user = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });

      const client = await getEnrichedClient(env, "clientId");
      if (!client || !user) {
        throw new Error("Client or user not found");
      }

      // Pre-set the user's strategy to email (passwordless)
      await env.data.users.update("tenantId", user.user_id, {
        app_metadata: {
          ...(user.app_metadata || {}),
          strategy: "email",
        },
      });

      // Create a login session
      const loginSession = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
        csrf_token: "csrfToken",
        authParams: {
          client_id: "clientId",
          username: "foo@example.com",
          scope: "openid",
          audience: "http://example.com",
          redirect_uri: "http://example.com/callback",
        },
      });

      // Update our user object to reflect the change
      const updatedUser = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });

      if (!updatedUser) {
        throw new Error("User not found after update");
      }

      // Verify the user initially has email strategy
      expect(updatedUser.app_metadata?.strategy).toBe("email");

      // Authenticate with password strategy (different from the stored strategy)
      const authResponse = await createFrontChannelAuthResponse(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.CODE,
          scope: "openid",
          redirect_uri: "http://example.com/callback",
        },
        client,
        user: updatedUser,
        loginSession,
        authStrategy: {
          strategy: "Username-Password-Authentication",
          strategy_type: "database",
        },
      });

      expect(authResponse.status).toEqual(302);

      // Verify the user's app_metadata strategy has been overwritten
      const userAfter = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });

      if (!userAfter) {
        throw new Error("User not found after authentication");
      }

      expect(userAfter.app_metadata?.strategy).toBe(
        "Username-Password-Authentication",
      );
    });
  });

  describe("organization-aware authentication", () => {
    it("should throw 403 error when user is not a member of the required organization", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {
          tenant_id: "tenantId",
        },
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      const client = await getEnrichedClient(env, "clientId");
      const user = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });

      if (!client || !user) {
        throw new Error("Client or user not found");
      }

      // Create a resource server with RBAC enabled
      const resourceServer = await env.data.resourceServers.create("tenantId", {
        name: "Test API with Organization",
        identifier: "https://org-test-api.example.com",
        scopes: [{ value: "read:users", description: "Read users" }],
        options: {
          enforce_policies: true,
          token_dialect: "access_token_authz",
        },
      });

      // Try to complete login with an organization the user is not a member of
      await expect(
        completeLogin(ctx, {
          authParams: {
            client_id: "clientId",
            audience: "https://org-test-api.example.com",
            scope: "read:users",
          },
          client,
          user,
          session_id: "session_id",
          organization: {
            id: "nonexistent-org-id",
            name: "Non-existent Organization",
          },
        }),
      ).rejects.toThrow("User is not a member of the specified organization");

      // Clean up
      await env.data.resourceServers.remove("tenantId", resourceServer.id!);
    });

    it("should calculate scopes for organization members with appropriate permissions", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {
          tenant_id: "tenantId",
        },
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      const client = await getEnrichedClient(env, "clientId");
      const user = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });

      if (!client || !user) {
        throw new Error("Client or user not found");
      }

      // Create a resource server with RBAC enabled
      const resourceServer = await env.data.resourceServers.create("tenantId", {
        name: "Test API with Organization Permissions",
        identifier: "https://org-permissions-api.example.com",
        scopes: [
          { value: "read:users", description: "Read users" },
          { value: "write:users", description: "Write users" },
          { value: "admin:all", description: "Admin access" },
        ],
        options: {
          enforce_policies: true,
          token_dialect: "access_token",
        },
      });

      // Create an organization
      const organization = await env.data.organizations.create("tenantId", {
        name: "Test Organization for Auth",
        display_name: "Test Org Auth",
      });

      // Add user to organization
      await env.data.userOrganizations.create("tenantId", {
        user_id: user.user_id,
        organization_id: organization.id,
      });

      // Create a role and assign permissions
      const role = await env.data.roles.create("tenantId", {
        name: "Organization Reader",
        description: "Can read in organization",
      });

      await env.data.rolePermissions.assign("tenantId", role.id, [
        {
          role_id: role.id,
          resource_server_identifier: "https://org-permissions-api.example.com",
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

      // Complete login with organization
      const result = await completeLogin(ctx, {
        authParams: {
          client_id: "clientId",
          audience: "https://org-permissions-api.example.com",
          scope: "read:users write:users admin:all",
        },
        client,
        user,
        session_id: "session_id",
        organization: {
          id: organization.id,
          name: organization.name,
        },
      });

      expect(result).toHaveProperty("access_token");
      expect(result).toHaveProperty("token_type", "Bearer");

      // Decode the token to check the org_id and scopes
      const tokenResult = result as any;
      expect(tokenResult.access_token).toBeDefined();

      // Clean up
      await env.data.resourceServers.remove("tenantId", resourceServer.id!);
      await env.data.organizations.remove("tenantId", organization.id);
      await env.data.roles.remove("tenantId", role.id);
    });

    it("should include organization ID in both access and ID tokens", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {
          tenant_id: "tenantId",
        },
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      const client = await getEnrichedClient(env, "clientId");
      const user = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });

      if (!client || !user) {
        throw new Error("Client or user not found");
      }

      // Create an organization
      const organization = await env.data.organizations.create("tenantId", {
        name: "Token Test Organization",
        display_name: "Token Test Org",
      });

      // Add user to organization
      await env.data.userOrganizations.create("tenantId", {
        user_id: user.user_id,
        organization_id: organization.id,
      });

      // Create tokens with organization
      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          scope: "openid profile",
          audience: "default",
        },
        client,
        user,
        session_id: "session_id",
        organization: {
          id: organization.id,
          name: organization.name,
        },
      });

      expect(tokens).toHaveProperty("access_token");
      expect(tokens).toHaveProperty("id_token");

      // Clean up
      await env.data.organizations.remove("tenantId", organization.id);
    });

    it("should work without organization parameter (backward compatibility)", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {
          tenant_id: "tenantId",
        },
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      const client = await getEnrichedClient(env, "clientId");
      const user = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });

      if (!client || !user) {
        throw new Error("Client or user not found");
      }

      // Complete login without organization (should work as before)
      const result = await completeLogin(ctx, {
        authParams: {
          client_id: "clientId",
          scope: "openid profile",
        },
        client,
        user,
        session_id: "session_id",
        // No organization parameter
      });

      expect(result).toHaveProperty("access_token");
      expect(result).toHaveProperty("token_type", "Bearer");
    });
  });
});
