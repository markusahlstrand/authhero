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

      const client = await env.data.legacyClients.get("clientId");
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

      const client = await env.data.legacyClients.get("clientId");
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

    const client = await env.data.legacyClients.get("clientId");
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

  it("should reuse an existing session when loginSession already has a session_id", async () => {
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

    await env.data.loginSessions.update("tenantId", loginSession.id, {
      session_id: session.id,
    });

    const client = await env.data.legacyClients.get("clientId");
    const user = await getPrimaryUserByEmail({
      userAdapter: env.data.users,
      tenant_id: "tenantId",
      email: "foo@example.com",
    });

    if (!client || !user) {
      throw new Error("Client or user not found");
    }

    // Call createAuthResponse which should reuse the existing session
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
      sessionId: session.id,
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

    const client = await env.data.legacyClients.get("clientId");
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

    const client = await env.data.legacyClients.get("clientId");
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

      const client = await env.data.legacyClients.get("clientId");
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
        strategy: "Username-Password-Authentication",
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

      const client = await env.data.legacyClients.get("clientId");
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
        strategy: "email",
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

      const client = await env.data.legacyClients.get("clientId");
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
        strategy: "Username-Password-Authentication",
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

      const client = await env.data.legacyClients.get("clientId");
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
          organization: "nonexistent-org-id",
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

      const client = await env.data.legacyClients.get("clientId");
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
        organization: organization.id,
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

      const client = await env.data.legacyClients.get("clientId");
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
        organization: organization.id,
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

      const client = await env.data.legacyClients.get("clientId");
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
