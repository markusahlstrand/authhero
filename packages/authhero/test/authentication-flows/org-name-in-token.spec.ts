import { describe, it, expect } from "vitest";
import { Context } from "hono";
import { createAuthTokens } from "../../src/authentication-flows/common";
import { getTestServer } from "../helpers/test-server";
import { Bindings, Variables } from "../../src/types";
import { getPrimaryUserByEmail } from "../../src/helpers/users";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";
import { parseJWT } from "oslo/jwt";
import { getEnrichedClient } from "../../src/helpers/client";

describe("org_name in tokens", () => {
  describe("when allow_organization_name_in_authentication_api is enabled", () => {
    it("should include org_name in access token", async () => {
      const { env } = await getTestServer();

      // Enable the flag on the tenant
      await env.data.tenants.update("tenantId", {
        allow_organization_name_in_authentication_api: true,
      });

      // Create an organization
      await env.data.organizations.create("tenantId", {
        id: "org_123",
        name: "test-tenant",
        display_name: "Test Tenant Org",
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

      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.TOKEN,
        },
        client,
        user,
        session_id: "session_id",
        organization: {
          id: "org_123",
          name: "test-tenant",
        },
      });

      expect(tokens.access_token).toBeDefined();

      // Parse the access token to verify org_name is included
      const parsed = parseJWT(tokens.access_token!);
      expect(parsed?.payload).toMatchObject({
        org_id: "org_123",
        org_name: "test-tenant",
      });
    });

    it("should include org_name in id token", async () => {
      const { env } = await getTestServer();

      // Enable the flag on the tenant
      await env.data.tenants.update("tenantId", {
        allow_organization_name_in_authentication_api: true,
      });

      // Create an organization
      await env.data.organizations.create("tenantId", {
        id: "org_456",
        name: "another-tenant",
        display_name: "Another Tenant Org",
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

      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
          scope: "openid",
        },
        client,
        user,
        session_id: "session_id",
        organization: {
          id: "org_456",
          name: "another-tenant",
        },
      });

      expect(tokens.id_token).toBeDefined();

      // Parse the id token to verify org_name is included
      const parsed = parseJWT(tokens.id_token!);
      expect(parsed?.payload).toMatchObject({
        org_id: "org_456",
        org_name: "another-tenant",
      });
    });
  });

  describe("when allow_organization_name_in_authentication_api is disabled", () => {
    it("should NOT include org_name in access token", async () => {
      const { env } = await getTestServer();

      // Ensure the flag is disabled on the tenant
      await env.data.tenants.update("tenantId", {
        allow_organization_name_in_authentication_api: false,
      });

      // Create an organization
      await env.data.organizations.create("tenantId", {
        id: "org_789",
        name: "disabled-tenant",
        display_name: "Disabled Tenant Org",
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

      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.TOKEN,
        },
        client,
        user,
        session_id: "session_id",
        organization: {
          id: "org_789",
          name: "disabled-tenant",
        },
      });

      expect(tokens.access_token).toBeDefined();

      // Parse the access token to verify org_name is NOT included
      const parsed = parseJWT(tokens.access_token!);
      expect(parsed?.payload).toMatchObject({
        org_id: "org_789",
      });
      expect((parsed?.payload as any).org_name).toBeUndefined();
    });

    it("should still include org_name in id token (always included per Auth0 spec)", async () => {
      const { env } = await getTestServer();

      // Ensure the flag is disabled on the tenant
      await env.data.tenants.update("tenantId", {
        allow_organization_name_in_authentication_api: false,
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

      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
          scope: "openid",
        },
        client,
        user,
        session_id: "session_id",
        organization: {
          id: "org_789",
          name: "disabled-tenant",
        },
      });

      expect(tokens.id_token).toBeDefined();

      // Parse the id token - org_name should always be included in id tokens
      const parsed = parseJWT(tokens.id_token!);
      expect(parsed?.payload).toMatchObject({
        org_id: "org_789",
        org_name: "disabled-tenant",
      });
    });
  });

  describe("when no organization is provided", () => {
    it("should not include org_id or org_name in tokens", async () => {
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
        // No organization provided
      });

      expect(tokens.access_token).toBeDefined();

      // Parse the access token to verify neither org_id nor org_name is included
      const parsed = parseJWT(tokens.access_token!);
      expect((parsed?.payload as any).org_id).toBeUndefined();
      expect((parsed?.payload as any).org_name).toBeUndefined();
    });
  });

  describe("org_name case normalization", () => {
    it("should lowercase org_name in access token for Auth0 SDK compatibility", async () => {
      const { env } = await getTestServer();

      // Enable the flag on the tenant
      await env.data.tenants.update("tenantId", {
        allow_organization_name_in_authentication_api: true,
      });

      // Create an organization with mixed-case name
      await env.data.organizations.create("tenantId", {
        id: "org_mixed",
        name: "DEFAULT_SETTINGS",
        display_name: "Default Settings Org",
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

      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
          scope: "openid",
        },
        client,
        user,
        session_id: "session_id",
        organization: {
          id: "org_mixed",
          name: "DEFAULT_SETTINGS", // Mixed case input
        },
      });

      expect(tokens.access_token).toBeDefined();
      expect(tokens.id_token).toBeDefined();

      // Parse the access token - org_name should be lowercase
      const accessParsed = parseJWT(tokens.access_token!);
      expect(accessParsed?.payload).toMatchObject({
        org_id: "org_mixed",
        org_name: "default_settings", // Should be lowercased
      });

      // Parse the id token - org_name should also be lowercase
      const idParsed = parseJWT(tokens.id_token!);
      expect(idParsed?.payload).toMatchObject({
        org_id: "org_mixed",
        org_name: "default_settings", // Should be lowercased
      });
    });
  });
});
