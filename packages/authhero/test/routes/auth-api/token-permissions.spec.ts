import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { parseJWT } from "oslo/jwt";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";

interface TokenResponse {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

describe("token endpoint - permissions in JWT", () => {
  describe("authorization_code flow with access_token_authz", () => {
    it("should include permissions in JWT token when resource server has enforce_policies=true and token_dialect=access_token_authz", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      // Create a resource server with RBAC enabled and access_token_authz dialect
      const resourceServer = await env.data.resourceServers.create("tenantId", {
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
      });

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
        resource_server_identifier: "https://permissions-test-api.example.com",
        permission_name: "read:users",
      });

      await env.data.userPermissions.create("tenantId", user.user_id, {
        user_id: user.user_id,
        resource_server_identifier: "https://permissions-test-api.example.com",
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
      // @ts-expect-error - testClient type requires both form and json
      const response = await client.oauth.token.$post({
        form: {
          grant_type: "authorization_code",
          client_id: "clientId",
          client_secret: "clientSecret",
          code: "test-permissions-code",
          redirect_uri: "https://example.com/callback",
        },
      });

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

      // THIS IS THE KEY TEST: Verify permissions are included in the token
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

    it("should include permissions when token_dialect is access_token (default) and RBAC is enabled", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      // Create a resource server with RBAC enabled but default token_dialect
      const resourceServer = await env.data.resourceServers.create("tenantId", {
        name: "Test API with Scopes",
        identifier: "https://scopes-test-api.example.com",
        scopes: [
          { value: "read:users", description: "Read users" },
          { value: "write:users", description: "Write users" },
        ],
        options: {
          enforce_policies: true, // RBAC enabled
          token_dialect: "access_token", // Should include both scopes and permissions
        },
      });

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
      // @ts-expect-error - testClient type requires both form and json
      const response = await client.oauth.token.$post({
        form: {
          grant_type: "authorization_code",
          client_id: "clientId",
          client_secret: "clientSecret",
          code: "test-scopes-code",
          redirect_uri: "https://example.com/callback",
        },
      });

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
      const resourceServer = await env.data.resourceServers.create("tenantId", {
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
      });

      // Create a client grant
      await env.data.clientGrants.create("tenantId", {
        client_id: "clientId",
        audience: "https://client-permissions-api.example.com",
        scope: ["read:data", "write:data"],
      });

      // Make client_credentials token request
      // @ts-expect-error - testClient type requires both form and json
      const response = await client.oauth.token.$post({
        form: {
          grant_type: "client_credentials",
          client_id: "clientId",
          client_secret: "clientSecret",
          audience: "https://client-permissions-api.example.com",
          scope: "read:data write:data",
        },
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as TokenResponse;

      // Parse the access token
      const accessToken = parseJWT(body.access_token);
      const payload = accessToken?.payload as any;

      expect(accessToken).not.toBeNull();
      expect(payload.sub).toBe("clientId");
      expect(payload.aud).toBe("https://client-permissions-api.example.com");

      // THIS IS THE KEY TEST: Verify permissions are included for client_credentials
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

  describe("client_credentials flow with RBAC enabled (default token_dialect)", () => {
    it("should NOT include permissions in JWT token for client_credentials grant with default token_dialect", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      // Create a resource server with RBAC enabled but default token_dialect
      const resourceServer = await env.data.resourceServers.create("tenantId", {
        identifier: "https://client-permissions-default-api.example.com",
        name: "Client Permissions Default API",
        scopes: [
          { value: "read:data", description: "Read data" },
          { value: "write:data", description: "Write data" },
        ],
        options: {
          enforce_policies: true, // RBAC enabled
          // token_dialect defaults to "access_token"
        },
      });

      // Create a client grant
      await env.data.clientGrants.create("tenantId", {
        client_id: "clientId",
        audience: "https://client-permissions-default-api.example.com",
        scope: ["read:data", "write:data"],
      });

      // Make client_credentials token request
      // @ts-expect-error - testClient type requires both form and json
      const response = await client.oauth.token.$post({
        form: {
          grant_type: "client_credentials",
          client_id: "clientId",
          client_secret: "clientSecret",
          audience: "https://client-permissions-default-api.example.com",
          scope: "read:data write:data",
        },
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as TokenResponse;

      // Parse the access token
      const accessToken = parseJWT(body.access_token);
      const payload = accessToken?.payload as any;

      expect(accessToken).not.toBeNull();
      expect(payload.sub).toBe("clientId");
      expect(payload.aud).toBe(
        "https://client-permissions-default-api.example.com",
      );

      // Auth0 behavior: permissions are ONLY included when token_dialect is access_token_authz
      // With default token_dialect (access_token), permissions should NOT be in the token
      expect(payload.permissions).toBeUndefined();

      // For default token_dialect, scopes should be included in scope claim
      expect(payload.scope).toBe("read:data write:data");

      // Clean up
      await env.data.resourceServers.remove("tenantId", resourceServer.id!);
    });
  });

  describe("client_credentials flow with RBAC disabled", () => {
    it("should not include permissions in JWT token for client_credentials grant", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      // Create a resource server with RBAC disabled
      const resourceServer = await env.data.resourceServers.create("tenantId", {
        identifier: "https://no-rbac-api.example.com",
        name: "No RBAC API",
        scopes: [
          { value: "read:data", description: "Read data" },
          { value: "write:data", description: "Write data" },
        ],
        options: {
          enforce_policies: false, // RBAC disabled
        },
      });

      // Create a client grant
      await env.data.clientGrants.create("tenantId", {
        client_id: "clientId",
        audience: "https://no-rbac-api.example.com",
        scope: ["read:data", "write:data"],
      });

      // Make client_credentials token request
      // @ts-expect-error - testClient type requires both form and json
      const response = await client.oauth.token.$post({
        form: {
          grant_type: "client_credentials",
          client_id: "clientId",
          client_secret: "clientSecret",
          audience: "https://no-rbac-api.example.com",
          scope: "read:data write:data",
        },
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as TokenResponse;

      // Parse the access token
      const accessToken = parseJWT(body.access_token);
      const payload = accessToken?.payload as any;

      expect(accessToken).not.toBeNull();
      expect(payload.sub).toBe("clientId");
      expect(payload.aud).toBe("https://no-rbac-api.example.com");

      // When RBAC is disabled, permissions should not be included
      expect(payload.permissions).toBeUndefined();

      // Scopes should still be included in the scope claim
      expect(payload.scope).toBe("read:data write:data");

      // Clean up
      await env.data.resourceServers.remove("tenantId", resourceServer.id!);
    });
  });

  describe("client_credentials flow with tenant default_audience", () => {
    it("should include permissions when tenant has default_audience and no audience provided", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      // Set default_audience on the tenant
      await env.data.tenants.update("tenantId", {
        default_audience: "https://default-audience-api.example.com",
      });

      // Create a resource server matching the default_audience
      const resourceServer = await env.data.resourceServers.create("tenantId", {
        identifier: "https://default-audience-api.example.com",
        name: "Default Audience API",
        scopes: [
          { value: "read:data", description: "Read data" },
          { value: "write:data", description: "Write data" },
        ],
        options: {
          enforce_policies: true, // RBAC enabled
          token_dialect: "access_token",
        },
      });

      // Create a client grant for the default audience
      await env.data.clientGrants.create("tenantId", {
        client_id: "clientId",
        audience: "https://default-audience-api.example.com",
        scope: ["read:data", "write:data"],
      });

      // Make client_credentials token request WITHOUT providing audience
      // @ts-expect-error - testClient type requires both form and json
      const response = await client.oauth.token.$post({
        form: {
          grant_type: "client_credentials",
          client_id: "clientId",
          client_secret: "clientSecret",
          scope: "read:data write:data",
          // No audience provided - should use tenant's default_audience
        },
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as TokenResponse;

      // Parse the access token
      const accessToken = parseJWT(body.access_token);
      const payload = accessToken?.payload as any;

      expect(accessToken).not.toBeNull();
      expect(payload.sub).toBe("clientId");
      expect(payload.aud).toBe("https://default-audience-api.example.com");

      // Auth0 behavior: permissions are ONLY included when token_dialect is access_token_authz
      // With default token_dialect (access_token), permissions should NOT be in the token
      expect(payload.permissions).toBeUndefined();

      // Scopes should be included
      expect(payload.scope).toBe("read:data write:data");

      // Clean up
      await env.data.resourceServers.remove("tenantId", resourceServer.id!);
      // Reset tenant default_audience
      await env.data.tenants.update("tenantId", {
        default_audience: undefined,
      });
    });
  });

  describe("client_credentials flow with unauthorized scopes", () => {
    it("should return 403 when requesting unauthorized scopes", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      // Create a resource server
      const resourceServer = await env.data.resourceServers.create("tenantId", {
        identifier: "https://unauthorized-scopes-api.example.com",
        name: "Unauthorized Scopes API",
        scopes: [
          { value: "read:data", description: "Read data" },
          { value: "write:data", description: "Write data" },
          { value: "admin:data", description: "Admin data" },
        ],
        options: {
          enforce_policies: true, // RBAC enabled
          token_dialect: "access_token",
        },
      });

      // Create a client grant with limited scopes
      await env.data.clientGrants.create("tenantId", {
        client_id: "clientId",
        audience: "https://unauthorized-scopes-api.example.com",
        scope: ["read:data", "write:data"], // admin:data is NOT granted
      });

      // Make client_credentials token request with unauthorized scope
      // @ts-expect-error - testClient type requires both form and json
      const response = await client.oauth.token.$post({
        form: {
          grant_type: "client_credentials",
          client_id: "clientId",
          client_secret: "clientSecret",
          audience: "https://unauthorized-scopes-api.example.com",
          scope: "read:data admin:data", // admin:data is not in client grant
        },
      });

      // Auth0 behavior: return 403 for unauthorized scopes
      expect(response.status).toBe(403);
      const body = (await response.json()) as { error: string; error_description: string };
      expect(body.error).toBe("access_denied");
      expect(body.error_description).toContain("admin:data");

      // Clean up
      await env.data.resourceServers.remove("tenantId", resourceServer.id!);
    });
  });

  describe("client_credentials flow with no scopes requested", () => {
    it("should return ALL granted scopes when no scopes are requested", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      // Create a resource server
      const resourceServer = await env.data.resourceServers.create("tenantId", {
        identifier: "https://all-scopes-api.example.com",
        name: "All Scopes API",
        scopes: [
          { value: "read:data", description: "Read data" },
          { value: "write:data", description: "Write data" },
          { value: "delete:data", description: "Delete data" },
        ],
        options: {
          enforce_policies: true, // RBAC enabled
          token_dialect: "access_token",
        },
      });

      // Create a client grant with all scopes
      await env.data.clientGrants.create("tenantId", {
        client_id: "clientId",
        audience: "https://all-scopes-api.example.com",
        scope: ["read:data", "write:data", "delete:data"],
      });

      // Make client_credentials token request WITHOUT specifying scopes
      // @ts-expect-error - testClient type requires both form and json
      const response = await client.oauth.token.$post({
        form: {
          grant_type: "client_credentials",
          client_id: "clientId",
          client_secret: "clientSecret",
          audience: "https://all-scopes-api.example.com",
          // No scope parameter - should return ALL granted scopes
        },
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as TokenResponse;

      // Parse the access token
      const accessToken = parseJWT(body.access_token);
      const payload = accessToken?.payload as any;

      expect(accessToken).not.toBeNull();
      expect(payload.sub).toBe("clientId");
      expect(payload.aud).toBe("https://all-scopes-api.example.com");

      // Auth0 behavior: ALL granted scopes should be returned
      expect(payload.scope).toContain("read:data");
      expect(payload.scope).toContain("write:data");
      expect(payload.scope).toContain("delete:data");

      // Auth0 behavior: permissions are ONLY included when token_dialect is access_token_authz
      // With default token_dialect (access_token), permissions should NOT be in the token
      expect(payload.permissions).toBeUndefined();

      // Clean up
      await env.data.resourceServers.remove("tenantId", resourceServer.id!);
    });
  });
});
