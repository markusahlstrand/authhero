import { describe, it, expect } from "vitest";
import { Context } from "hono";
import { calculateScopesAndPermissions } from "../../src/helpers/scopes-permissions";
import { getTestServer } from "../helpers/test-server";
import { Bindings, Variables } from "../../src/types";
import { GrantType } from "@authhero/adapter-interfaces";

describe("scopes-permissions helper", () => {
  describe("calculateScopesAndPermissions", () => {
    it("should return all requested scopes when no resource server matches the audience", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {},
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      const result = await calculateScopesAndPermissions(ctx, {
        tenantId: "tenantId",
        clientId: "test-client-id",
        userId: "userId",
        audience: "https://nonexistent-api.example.com",
        requestedScopes: ["read:users", "write:users"],
      });

      // When no resource server is defined, all requested scopes are returned
      expect(result).toEqual({
        scopes: ["read:users", "write:users"],
        permissions: [],
      });
    });

    it("should return all requested scopes when RBAC is disabled", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {},
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      // Create a resource server without RBAC enabled
      const resourceServer = await env.data.resourceServers.create("tenantId", {
        name: "Test API",
        identifier: "https://test-api.example.com",
        scopes: [
          { value: "read:users", description: "Read users" },
          { value: "write:users", description: "Write users" },
          { value: "delete:users", description: "Delete users" },
        ],
        options: {
          enforce_policies: false, // RBAC disabled
          token_dialect: "access_token",
        },
      });

      const result = await calculateScopesAndPermissions(ctx, {
        tenantId: "tenantId",
        clientId: "test-client-id",
        userId: "userId",
        audience: "https://test-api.example.com",
        requestedScopes: ["read:users", "write:users", "invalid:scope"],
      });

      // When RBAC is disabled, all requested scopes are returned (Auth0 behavior)
      expect(result).toEqual({
        scopes: ["read:users", "write:users", "invalid:scope"],
        permissions: [],
      });

      // Clean up
      await env.data.resourceServers.remove("tenantId", resourceServer.id!);
    });

    it("should return permissions when RBAC is enabled and token_dialect is access_token_authz", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {},
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      // Create a resource server with RBAC enabled and access_token_authz dialect
      const resourceServer = await env.data.resourceServers.create("tenantId", {
        name: "Test API with RBAC",
        identifier: "https://rbac-api.example.com",
        scopes: [
          { value: "read:users", description: "Read users" },
          { value: "write:users", description: "Write users" },
          { value: "admin:all", description: "Admin access" },
        ],
        options: {
          enforce_policies: true, // RBAC enabled
          token_dialect: "access_token_authz",
        },
      });

      // Create a user with direct permissions
      await env.data.userPermissions.create("tenantId", "testUserId", {
        user_id: "testUserId",
        resource_server_identifier: "https://rbac-api.example.com",
        permission_name: "read:users",
      });

      await env.data.userPermissions.create("tenantId", "testUserId", {
        user_id: "testUserId",
        resource_server_identifier: "https://rbac-api.example.com",
        permission_name: "write:users",
      });

      const result = await calculateScopesAndPermissions(ctx, {
        tenantId: "tenantId",
        clientId: "test-client-id",
        userId: "testUserId",
        audience: "https://rbac-api.example.com",
        requestedScopes: ["read:users", "write:users", "admin:all"],
      });

      expect(result).toEqual({
        scopes: [],
        permissions: ["read:users", "write:users"], // User has these permissions
      });

      // Clean up
      await env.data.resourceServers.remove("tenantId", resourceServer.id!);
    });

    it("should return scopes based on user permissions when RBAC is enabled with access_token dialect", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {},
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      // Create a resource server with RBAC enabled and access_token dialect
      const resourceServer = await env.data.resourceServers.create("tenantId", {
        name: "Test API with RBAC Scopes",
        identifier: "https://rbac-scopes-api.example.com",
        scopes: [
          { value: "read:users", description: "Read users" },
          { value: "write:users", description: "Write users" },
          { value: "admin:all", description: "Admin access" },
        ],
        options: {
          enforce_policies: true, // RBAC enabled
          token_dialect: "access_token", // Use scopes, not permissions
        },
      });

      // Create a user with direct permissions
      await env.data.userPermissions.create("tenantId", "testUserId2", {
        user_id: "testUserId2",
        resource_server_identifier: "https://rbac-scopes-api.example.com",
        permission_name: "read:users",
      });

      const result = await calculateScopesAndPermissions(ctx, {
        tenantId: "tenantId",
        clientId: "test-client-id",
        userId: "testUserId2",
        audience: "https://rbac-scopes-api.example.com",
        requestedScopes: ["read:users", "write:users", "admin:all"],
      });

      expect(result).toEqual({
        scopes: ["read:users"], // Only the scope the user has permission for
        permissions: [], // Auth0: permissions only included with access_token_authz dialect
      }); // Clean up
      await env.data.resourceServers.remove("tenantId", resourceServer.id!);
    });

    it("should pass through scopes not defined on resource server when RBAC is enabled", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {},
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      // Create a resource server with RBAC enabled - only "impersonate" scope is defined/restricted
      const resourceServer = await env.data.resourceServers.create("tenantId", {
        name: "Test API with Restricted Scopes",
        identifier: "https://restricted-api.example.com",
        scopes: [
          { value: "impersonate", description: "Impersonate users - restricted" },
        ],
        options: {
          enforce_policies: true, // RBAC enabled
          token_dialect: "access_token",
        },
      });

      // User does NOT have the impersonate permission
      const result = await calculateScopesAndPermissions(ctx, {
        tenantId: "tenantId",
        clientId: "test-client-id",
        userId: "testUserId3",
        audience: "https://restricted-api.example.com",
        requestedScopes: ["openid", "impersonate", "entitlement"],
      });

      expect(result).toEqual({
        // "openid" - OIDC scope, always allowed
        // "impersonate" - defined on resource server but user lacks permission, NOT included
        // "entitlement" - not defined on resource server, passes through
        scopes: ["openid", "entitlement"],
        permissions: [],
      });

      // Clean up
      await env.data.resourceServers.remove("tenantId", resourceServer.id!);
    });

    it("should include restricted scope when user has permission", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {},
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      // Create a resource server with RBAC enabled
      const resourceServer = await env.data.resourceServers.create("tenantId", {
        name: "Test API with Impersonate",
        identifier: "https://impersonate-api.example.com",
        scopes: [
          { value: "impersonate", description: "Impersonate users - restricted" },
        ],
        options: {
          enforce_policies: true,
          token_dialect: "access_token",
        },
      });

      // Give user the impersonate permission
      await env.data.userPermissions.create("tenantId", "adminUser", {
        user_id: "adminUser",
        resource_server_identifier: "https://impersonate-api.example.com",
        permission_name: "impersonate",
      });

      const result = await calculateScopesAndPermissions(ctx, {
        tenantId: "tenantId",
        clientId: "test-client-id",
        userId: "adminUser",
        audience: "https://impersonate-api.example.com",
        requestedScopes: ["openid", "impersonate", "entitlement"],
      });

      expect(result).toEqual({
        // "openid" - OIDC scope, always allowed
        // "impersonate" - defined on resource server AND user has permission, included
        // "entitlement" - not defined on resource server, passes through
        scopes: ["openid", "impersonate", "entitlement"],
        permissions: [], // Auth0: permissions only included with access_token_authz dialect
      });

      // Clean up
      await env.data.resourceServers.remove("tenantId", resourceServer.id!);
    });

    it("should combine direct permissions and role-based permissions", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {},
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      // Create a resource server with RBAC enabled
      const resourceServer = await env.data.resourceServers.create("tenantId", {
        name: "Test API with Roles",
        identifier: "https://roles-api.example.com",
        scopes: [
          { value: "read:users", description: "Read users" },
          { value: "write:users", description: "Write users" },
          { value: "admin:all", description: "Admin access" },
        ],
        options: {
          enforce_policies: true,
          token_dialect: "access_token_authz",
        },
      });

      // Create a role with permissions
      const role = await env.data.roles.create("tenantId", {
        name: "Editor",
        description: "Can edit users",
      });

      // Assign permissions to the role
      await env.data.rolePermissions.assign("tenantId", role.id, [
        {
          role_id: role.id,
          resource_server_identifier: "https://roles-api.example.com",
          permission_name: "write:users",
        },
      ]);

      // Assign the role to a user
      await env.data.userRoles.create("tenantId", "testUserId3", role.id);

      // Also give the user a direct permission
      await env.data.userPermissions.create("tenantId", "testUserId3", {
        user_id: "testUserId3",
        resource_server_identifier: "https://roles-api.example.com",
        permission_name: "read:users",
      });

      const result = await calculateScopesAndPermissions(ctx, {
        tenantId: "tenantId",
        clientId: "test-client-id",
        userId: "testUserId3",
        audience: "https://roles-api.example.com",
        requestedScopes: ["read:users", "write:users", "admin:all"],
      });

      expect(result).toEqual({
        scopes: [],
        permissions: expect.arrayContaining(["read:users", "write:users"]),
      });

      // Clean up
      await env.data.resourceServers.remove("tenantId", resourceServer.id!);
      await env.data.roles.remove("tenantId", role.id);
    });

    it("should return only requested scopes but all permissions when user has more permissions than requested", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {},
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      // Create a resource server with RBAC enabled
      const resourceServer = await env.data.resourceServers.create("tenantId", {
        name: "Test API with User Subset",
        identifier: "https://user-subset-api.example.com",
        scopes: [
          { value: "read:users", description: "Read users" },
          { value: "write:users", description: "Write users" },
          { value: "delete:users", description: "Delete users" },
        ],
        options: {
          enforce_policies: true, // RBAC enabled
          token_dialect: "access_token",
        },
      });

      // Create a user with multiple permissions
      await env.data.userPermissions.create("tenantId", "testUserId4", {
        user_id: "testUserId4",
        resource_server_identifier: "https://user-subset-api.example.com",
        permission_name: "read:users",
      });

      await env.data.userPermissions.create("tenantId", "testUserId4", {
        user_id: "testUserId4",
        resource_server_identifier: "https://user-subset-api.example.com",
        permission_name: "write:users",
      });

      await env.data.userPermissions.create("tenantId", "testUserId4", {
        user_id: "testUserId4",
        resource_server_identifier: "https://user-subset-api.example.com",
        permission_name: "delete:users",
      });

      const result = await calculateScopesAndPermissions(ctx, {
        tenantId: "tenantId",
        clientId: "test-client-id",
        userId: "testUserId4",
        audience: "https://user-subset-api.example.com",
        requestedScopes: ["read:users"], // Only requesting read permission
      });

      expect(result).toEqual({
        scopes: ["read:users"], // Only the requested scope
        permissions: [], // Auth0: permissions only included with access_token_authz dialect
      });

      // Clean up
      await env.data.resourceServers.remove("tenantId", resourceServer.id!);
    });

    it("should throw 403 error when user is not a member of the specified organization", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {},
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      // Create a resource server
      const resourceServer = await env.data.resourceServers.create("tenantId", {
        name: "Test API with Org",
        identifier: "https://org-api.example.com",
        scopes: [{ value: "read:users", description: "Read users" }],
        options: {
          enforce_policies: true,
          token_dialect: "access_token_authz",
        },
      });

      // Try to get permissions for an organization the user is not a member of
      await expect(
        calculateScopesAndPermissions(ctx, {
          tenantId: "tenantId",
          clientId: "test-client-id",
          userId: "nonMemberUserId",
          audience: "https://org-api.example.com",
          requestedScopes: ["read:users"],
          organizationId: "org123",
        }),
      ).rejects.toThrow("User is not a member of the specified organization");

      // Clean up
      await env.data.resourceServers.remove("tenantId", resourceServer.id!);
    });

    it("should return permissions for organization members with organization-specific roles", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {},
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      // Create a resource server
      const resourceServer = await env.data.resourceServers.create("tenantId", {
        name: "Test API with Org Roles",
        identifier: "https://org-roles-api.example.com",
        scopes: [
          { value: "read:users", description: "Read users" },
          { value: "write:users", description: "Write users" },
        ],
        options: {
          enforce_policies: true,
          token_dialect: "access_token_authz",
        },
      });

      // Create an organization
      const organization = await env.data.organizations.create("tenantId", {
        name: "Test Organization",
        display_name: "Test Org",
      });

      // Create a role
      const role = await env.data.roles.create("tenantId", {
        name: "Org Editor",
        description: "Can edit in organization",
      });

      // Assign permissions to the role
      await env.data.rolePermissions.assign("tenantId", role.id, [
        {
          role_id: role.id,
          resource_server_identifier: "https://org-roles-api.example.com",
          permission_name: "write:users",
        },
      ]);

      // Add user to organization
      await env.data.userOrganizations.create("tenantId", {
        user_id: "orgUserId",
        organization_id: organization.id,
      });

      // Assign organization-specific role to user
      await env.data.userRoles.create(
        "tenantId",
        "orgUserId",
        role.id,
        organization.id,
      );

      // Also give user a direct organization-specific permission
      await env.data.userPermissions.create(
        "tenantId",
        "orgUserId",
        {
          user_id: "orgUserId",
          resource_server_identifier: "https://org-roles-api.example.com",
          permission_name: "read:users",
        },
        organization.id,
      );

      const result = await calculateScopesAndPermissions(ctx, {
        tenantId: "tenantId",
        clientId: "test-client-id",
        userId: "orgUserId",
        audience: "https://org-roles-api.example.com",
        requestedScopes: ["read:users", "write:users"],
        organizationId: organization.id,
      });

      expect(result).toEqual({
        scopes: [],
        permissions: expect.arrayContaining(["read:users", "write:users"]),
      });

      // Clean up
      await env.data.resourceServers.remove("tenantId", resourceServer.id!);
      await env.data.organizations.remove("tenantId", organization.id);
      await env.data.roles.remove("tenantId", role.id);
    });

    it("should combine global and organization-specific roles when organizationId is provided", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {},
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      // Create a resource server
      const resourceServer = await env.data.resourceServers.create("tenantId", {
        name: "Test API Mixed Roles",
        identifier: "https://mixed-roles-api.example.com",
        scopes: [
          { value: "read:users", description: "Read users" },
          { value: "write:users", description: "Write users" },
          { value: "admin:all", description: "Admin access" },
        ],
        options: {
          enforce_policies: true,
          token_dialect: "access_token_authz",
        },
      });

      // Create an organization
      const organization = await env.data.organizations.create("tenantId", {
        name: "Mixed Roles Organization",
        display_name: "Mixed Roles Org",
      });

      // Create global and org-specific roles
      const globalRole = await env.data.roles.create("tenantId", {
        name: "Global Reader",
        description: "Can read globally",
      });

      const orgRole = await env.data.roles.create("tenantId", {
        name: "Org Writer",
        description: "Can write in organization",
      });

      // Assign permissions to roles
      await env.data.rolePermissions.assign("tenantId", globalRole.id, [
        {
          role_id: globalRole.id,
          resource_server_identifier: "https://mixed-roles-api.example.com",
          permission_name: "read:users",
        },
      ]);

      await env.data.rolePermissions.assign("tenantId", orgRole.id, [
        {
          role_id: orgRole.id,
          resource_server_identifier: "https://mixed-roles-api.example.com",
          permission_name: "write:users",
        },
      ]);

      // Add user to organization
      await env.data.userOrganizations.create("tenantId", {
        user_id: "mixedUserId",
        organization_id: organization.id,
      });

      // Assign global role (empty string for organizationId)
      await env.data.userRoles.create(
        "tenantId",
        "mixedUserId",
        globalRole.id,
        "",
      );

      // Assign organization-specific role
      await env.data.userRoles.create(
        "tenantId",
        "mixedUserId",
        orgRole.id,
        organization.id,
      );

      const result = await calculateScopesAndPermissions(ctx, {
        tenantId: "tenantId",
        clientId: "test-client-id",
        userId: "mixedUserId",
        audience: "https://mixed-roles-api.example.com",
        requestedScopes: ["read:users", "write:users", "admin:all"],
        organizationId: organization.id,
      });

      expect(result).toEqual({
        scopes: [],
        permissions: expect.arrayContaining(["read:users", "write:users"]),
      });

      // Clean up
      await env.data.resourceServers.remove("tenantId", resourceServer.id!);
      await env.data.organizations.remove("tenantId", organization.id);
      await env.data.roles.remove("tenantId", globalRole.id);
      await env.data.roles.remove("tenantId", orgRole.id);
    });

    it("should enforce organization membership even without a valid audience", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {},
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      // Test the vulnerability: organizationId is provided but audience doesn't match any resource server
      // This should still validate organization membership and throw 403 for non-members
      await expect(
        calculateScopesAndPermissions(ctx, {
          tenantId: "tenantId",
          clientId: "test-client-id",
          userId: "nonMemberUserId",
          audience: "https://nonexistent-api.example.com", // No matching resource server
          requestedScopes: ["openid", "profile"],
          organizationId: "org123", // User trying to forge org_id
        }),
      ).rejects.toThrow("User is not a member of the specified organization");
    });

    it("should enforce organization membership even when RBAC is disabled", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {},
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      // Create a resource server with RBAC disabled
      const resourceServer = await env.data.resourceServers.create("tenantId", {
        name: "Non-RBAC API",
        identifier: "https://non-rbac-api.example.com",
        scopes: [{ value: "read:data", description: "Read data" }],
        options: {
          enforce_policies: false, // RBAC disabled
          token_dialect: "access_token",
        },
      });

      // Test the vulnerability: organizationId is provided but RBAC is disabled
      // This should still validate organization membership and throw 403 for non-members
      await expect(
        calculateScopesAndPermissions(ctx, {
          tenantId: "tenantId",
          clientId: "test-client-id",
          userId: "nonMemberUserId",
          audience: "https://non-rbac-api.example.com",
          requestedScopes: ["read:data"],
          organizationId: "org456", // User trying to forge org_id on non-RBAC resource
        }),
      ).rejects.toThrow("User is not a member of the specified organization");

      // Clean up
      await env.data.resourceServers.remove("tenantId", resourceServer.id!);
    });

    describe("inherit_global_permissions_in_organizations with admin:organizations", () => {
      it("should allow users with admin:organizations to get organization tokens for any organization without membership", async () => {
        const { env } = await getTestServer();
        const ctx = {
          env,
          var: {},
        } as Context<{
          Bindings: Bindings;
          Variables: Variables;
        }>;

        // Create a resource server with RBAC enabled
        const resourceServer = await env.data.resourceServers.create(
          "tenantId",
          {
            name: "Test API for Admin",
            identifier: "https://admin-test-api.example.com",
            scopes: [
              { value: "read:users", description: "Read users" },
              { value: "write:users", description: "Write users" },
              { value: "admin:organizations", description: "Admin organizations" },
            ],
            options: {
              enforce_policies: true,
              token_dialect: "access_token_authz",
            },
          },
        );

        // Create an organization that the user is NOT a member of
        const organization = await env.data.organizations.create("tenantId", {
          name: "Target Organization",
          display_name: "Target Org",
        });

        // Create a global admin role with admin:organizations permission
        const adminRole = await env.data.roles.create("tenantId", {
          name: "Global Organization Admin",
          description: "Can manage all organizations",
        });

        // Assign the admin:organizations and read:users permissions to the role
        await env.data.rolePermissions.assign("tenantId", adminRole.id, [
          {
            role_id: adminRole.id,
            resource_server_identifier: "https://admin-test-api.example.com",
            permission_name: "admin:organizations",
          },
          {
            role_id: adminRole.id,
            resource_server_identifier: "https://admin-test-api.example.com",
            permission_name: "read:users",
          },
        ]);

        // Assign global role to user (organizationId = "" for global)
        await env.data.userRoles.create(
          "tenantId",
          "globalAdminUserId",
          adminRole.id,
          "", // Global role (no organization)
        );

        // Enable the inherit_global_permissions_in_organizations flag
        await env.data.tenants.update("tenantId", {
          flags: {
            inherit_global_permissions_in_organizations: true,
          },
        });

        // User should be able to get organization token with their global permissions
        // even though they're NOT a member of the organization
        const result = await calculateScopesAndPermissions(ctx, {
          tenantId: "tenantId",
          clientId: "test-client-id",
          userId: "globalAdminUserId",
          audience: "https://admin-test-api.example.com",
          requestedScopes: ["read:users", "admin:organizations"],
          organizationId: organization.id,
        });

        expect(result).toEqual({
          scopes: [],
          permissions: expect.arrayContaining(["admin:organizations", "read:users"]),
        });

        // Clean up
        await env.data.resourceServers.remove("tenantId", resourceServer.id!);
        await env.data.organizations.remove("tenantId", organization.id);
        await env.data.roles.remove("tenantId", adminRole.id);
        await env.data.tenants.update("tenantId", {
          flags: {
            inherit_global_permissions_in_organizations: false,
          },
        });
      });

      it("should only grant permissions the user actually has at the global level", async () => {
        const { env } = await getTestServer();
        const ctx = {
          env,
          var: {},
        } as Context<{
          Bindings: Bindings;
          Variables: Variables;
        }>;

        // Create a resource server with RBAC enabled
        const resourceServer = await env.data.resourceServers.create(
          "tenantId",
          {
            name: "Test API for Permission Check",
            identifier: "https://permission-check-api.example.com",
            scopes: [
              { value: "read:users", description: "Read users" },
              { value: "write:users", description: "Write users" },
              { value: "delete:users", description: "Delete users" },
              { value: "admin:organizations", description: "Admin organizations" },
            ],
            options: {
              enforce_policies: true,
              token_dialect: "access_token_authz",
            },
          },
        );

        // Create an organization
        const organization = await env.data.organizations.create("tenantId", {
          name: "Permission Test Org",
          display_name: "Permission Test Organization",
        });

        // Create a limited role - only has read:users and admin:organizations
        const limitedRole = await env.data.roles.create("tenantId", {
          name: "Limited Admin",
          description: "Can admin orgs but only read users",
        });

        // Only assign read:users and admin:organizations (NOT write:users or delete:users)
        await env.data.rolePermissions.assign("tenantId", limitedRole.id, [
          {
            role_id: limitedRole.id,
            resource_server_identifier: "https://permission-check-api.example.com",
            permission_name: "admin:organizations",
          },
          {
            role_id: limitedRole.id,
            resource_server_identifier: "https://permission-check-api.example.com",
            permission_name: "read:users",
          },
        ]);

        // Assign global role to user
        await env.data.userRoles.create(
          "tenantId",
          "limitedAdminUserId",
          limitedRole.id,
          "", // Global role
        );

        // Enable the flag
        await env.data.tenants.update("tenantId", {
          flags: {
            inherit_global_permissions_in_organizations: true,
          },
        });

        // User requests more permissions than they have
        const result = await calculateScopesAndPermissions(ctx, {
          tenantId: "tenantId",
          clientId: "test-client-id",
          userId: "limitedAdminUserId",
          audience: "https://permission-check-api.example.com",
          requestedScopes: ["read:users", "write:users", "delete:users", "admin:organizations"],
          organizationId: organization.id,
        });

        // Should only get the permissions they actually have
        expect(result.permissions).toContain("read:users");
        expect(result.permissions).toContain("admin:organizations");
        expect(result.permissions).not.toContain("write:users");
        expect(result.permissions).not.toContain("delete:users");

        // Clean up
        await env.data.resourceServers.remove("tenantId", resourceServer.id!);
        await env.data.organizations.remove("tenantId", organization.id);
        await env.data.roles.remove("tenantId", limitedRole.id);
        await env.data.tenants.update("tenantId", {
          flags: {
            inherit_global_permissions_in_organizations: false,
          },
        });
      });

      it("should reject non-member users without admin:organizations when flag is enabled", async () => {
        const { env } = await getTestServer();
        const ctx = {
          env,
          var: {},
        } as Context<{
          Bindings: Bindings;
          Variables: Variables;
        }>;

        // Create a resource server
        const resourceServer = await env.data.resourceServers.create(
          "tenantId",
          {
            name: "Test API for Rejection",
            identifier: "https://rejection-test-api.example.com",
            scopes: [
              { value: "read:users", description: "Read users" },
            ],
            options: {
              enforce_policies: true,
              token_dialect: "access_token_authz",
            },
          },
        );

        // Create an organization
        const organization = await env.data.organizations.create("tenantId", {
          name: "Rejection Test Org",
          display_name: "Rejection Test Organization",
        });

        // Create a role WITHOUT admin:organizations
        const regularRole = await env.data.roles.create("tenantId", {
          name: "Regular User Role",
          description: "Can only read users",
        });

        await env.data.rolePermissions.assign("tenantId", regularRole.id, [
          {
            role_id: regularRole.id,
            resource_server_identifier: "https://rejection-test-api.example.com",
            permission_name: "read:users",
          },
        ]);

        // Assign global role to user (but no admin:organizations)
        await env.data.userRoles.create(
          "tenantId",
          "regularUserId",
          regularRole.id,
          "", // Global role
        );

        // Enable the flag
        await env.data.tenants.update("tenantId", {
          flags: {
            inherit_global_permissions_in_organizations: true,
          },
        });

        // User without admin:organizations should still be rejected when not a member
        await expect(
          calculateScopesAndPermissions(ctx, {
            tenantId: "tenantId",
            clientId: "test-client-id",
            userId: "regularUserId",
            audience: "https://rejection-test-api.example.com",
            requestedScopes: ["read:users"],
            organizationId: organization.id,
          }),
        ).rejects.toThrow("User is not a member of the specified organization");

        // Clean up
        await env.data.resourceServers.remove("tenantId", resourceServer.id!);
        await env.data.organizations.remove("tenantId", organization.id);
        await env.data.roles.remove("tenantId", regularRole.id);
        await env.data.tenants.update("tenantId", {
          flags: {
            inherit_global_permissions_in_organizations: false,
          },
        });
      });
    });

    describe("client_credentials grant", () => {
      it("should throw 403 when requesting unauthorized scopes", async () => {
        const { env } = await getTestServer();
        const ctx = {
          env,
          var: {},
        } as Context<{
          Bindings: Bindings;
          Variables: Variables;
        }>;

        // Create a resource server
        const resourceServer = await env.data.resourceServers.create(
          "tenantId",
          {
            identifier: "https://client-credentials-api.example.com",
            name: "Client Credentials API",
            scopes: [
              { value: "read:users", description: "Read users" },
              { value: "write:users", description: "Write users" },
              { value: "delete:users", description: "Delete users" },
            ],
            options: {
              enforce_policies: true, // RBAC enabled
              token_dialect: "access_token",
            },
          },
        );

        // Create a test client
        await env.data.clients.create("tenantId", {
          client_id: "test-client-id",
          name: "Test Client",
        });

        // Create a client grant that only allows read:users and write:users
        await env.data.clientGrants.create("tenantId", {
          client_id: "test-client-id",
          audience: "https://client-credentials-api.example.com",
          scope: ["read:users", "write:users"], // delete:users is NOT granted
        });

        // Auth0 behavior: requesting an unauthorized scope returns 403
        await expect(
          calculateScopesAndPermissions(ctx, {
            grantType: GrantType.ClientCredential,
            tenantId: "tenantId",
            clientId: "test-client-id",
            audience: "https://client-credentials-api.example.com",
            requestedScopes: ["read:users", "write:users", "delete:users"], // Requesting unauthorized scope
          }),
        ).rejects.toThrow();

        // Clean up
        await env.data.resourceServers.remove("tenantId", resourceServer.id!);
      });

      it("should return intersection of requested and granted scopes when scopes are requested", async () => {
        const { env } = await getTestServer();
        const ctx = {
          env,
          var: {},
        } as Context<{
          Bindings: Bindings;
          Variables: Variables;
        }>;

        // Create a resource server
        const resourceServer = await env.data.resourceServers.create(
          "tenantId",
          {
            identifier: "https://client-subset-api.example.com",
            name: "Client Subset API",
            scopes: [
              { value: "read:users", description: "Read users" },
              { value: "write:users", description: "Write users" },
              { value: "delete:users", description: "Delete users" },
            ],
            options: {
              enforce_policies: true, // RBAC enabled
              token_dialect: "access_token",
            },
          },
        );

        // Create a test client
        await env.data.clients.create("tenantId", {
          client_id: "test-client-id",
          name: "Test Client",
        });

        // Create a client grant that allows all scopes
        await env.data.clientGrants.create("tenantId", {
          client_id: "test-client-id",
          audience: "https://client-subset-api.example.com",
          scope: ["read:users", "write:users", "delete:users"], // Client has all permissions
        });

        const result = await calculateScopesAndPermissions(ctx, {
          grantType: GrantType.ClientCredential,
          tenantId: "tenantId",
          clientId: "test-client-id",
          audience: "https://client-subset-api.example.com",
          requestedScopes: ["read:users"], // Only requesting read permission
        });

        // Auth0 behavior: when scopes ARE requested, return intersection of requested and granted
        // Permissions are only included when token_dialect is access_token_authz
        expect(result).toEqual({
          scopes: ["read:users"], // Only the requested scope (intersection)
          permissions: [], // No permissions with default token_dialect (access_token)
        });

        // Clean up
        await env.data.resourceServers.remove("tenantId", resourceServer.id!);
      });

      it("should return ALL granted scopes when no scopes are requested", async () => {
        const { env } = await getTestServer();
        const ctx = {
          env,
          var: {},
        } as Context<{
          Bindings: Bindings;
          Variables: Variables;
        }>;

        // Create a resource server
        const resourceServer = await env.data.resourceServers.create(
          "tenantId",
          {
            identifier: "https://client-all-scopes-api.example.com",
            name: "Client All Scopes API",
            scopes: [
              { value: "read:users", description: "Read users" },
              { value: "write:users", description: "Write users" },
              { value: "delete:users", description: "Delete users" },
            ],
            options: {
              enforce_policies: true, // RBAC enabled
              token_dialect: "access_token",
            },
          },
        );

        // Create a test client
        await env.data.clients.create("tenantId", {
          client_id: "test-client-id",
          name: "Test Client",
        });

        // Create a client grant that allows all scopes
        await env.data.clientGrants.create("tenantId", {
          client_id: "test-client-id",
          audience: "https://client-all-scopes-api.example.com",
          scope: ["read:users", "write:users", "delete:users"],
        });

        const result = await calculateScopesAndPermissions(ctx, {
          grantType: GrantType.ClientCredential,
          tenantId: "tenantId",
          clientId: "test-client-id",
          audience: "https://client-all-scopes-api.example.com",
          requestedScopes: [], // No scopes requested
        });

        // Auth0 behavior: when NO scopes are requested, return ALL granted scopes
        expect(result).toEqual({
          scopes: ["read:users", "write:users", "delete:users"], // All granted scopes
          permissions: [], // No permissions with default token_dialect (access_token)
        });

        // Clean up
        await env.data.resourceServers.remove("tenantId", resourceServer.id!);
      });

      it("should return permissions when token_dialect is access_token_authz for client_credentials", async () => {
        const { env } = await getTestServer();
        const ctx = {
          env,
          var: {},
        } as Context<{
          Bindings: Bindings;
          Variables: Variables;
        }>;

        // Create a resource server with access_token_authz dialect
        const resourceServer = await env.data.resourceServers.create(
          "tenantId",
          {
            identifier: "https://authz-api.example.com",
            name: "Authorization API",
            scopes: [
              { value: "read:data", description: "Read data" },
              { value: "write:data", description: "Write data" },
            ],
            options: {
              enforce_policies: true, // RBAC enabled
              token_dialect: "access_token_authz",
            },
          },
        );

        // Create a test client
        await env.data.clients.create("tenantId", {
          client_id: "test-client-id",
          name: "Test Client",
        });

        // Create a client grant with only read:data
        await env.data.clientGrants.create("tenantId", {
          client_id: "test-client-id",
          audience: "https://authz-api.example.com",
          scope: ["read:data"],
        });

        // Auth0 behavior: requesting unauthorized scope (write:data) throws 403
        await expect(
          calculateScopesAndPermissions(ctx, {
            grantType: GrantType.ClientCredential,
            tenantId: "tenantId",
            clientId: "test-client-id",
            audience: "https://authz-api.example.com",
            requestedScopes: ["read:data", "write:data"], // write:data is not granted
          }),
        ).rejects.toThrow();

        // When only requesting authorized scope, should succeed
        const result = await calculateScopesAndPermissions(ctx, {
          grantType: GrantType.ClientCredential,
          tenantId: "tenantId",
          clientId: "test-client-id",
          audience: "https://authz-api.example.com",
          requestedScopes: ["read:data"], // Only requesting authorized scope
        });

        // Auth0 behavior: scopes go in scope claim, permissions go in permissions claim
        expect(result).toEqual({
          scopes: ["read:data"], // Requested scope in scope claim
          permissions: ["read:data"], // Permissions in permissions claim
        });

        // Clean up
        await env.data.resourceServers.remove("tenantId", resourceServer.id!);
      });

      it("should return empty arrays when no client grant exists", async () => {
        const { env } = await getTestServer();
        const ctx = {
          env,
          var: {},
        } as Context<{
          Bindings: Bindings;
          Variables: Variables;
        }>;

        // Create a resource server
        const resourceServer = await env.data.resourceServers.create(
          "tenantId",
          {
            identifier: "https://no-grant-api.example.com",
            name: "No Grant API",
            scopes: [{ value: "read:data", description: "Read data" }],
            options: {
              enforce_policies: true,
              token_dialect: "access_token",
            },
          },
        );

        // Create a test client
        await env.data.clients.create("tenantId", {
          client_id: "test-client-id",
          name: "Test Client",
        });

        // No client grant created for this client and audience

        const result = await calculateScopesAndPermissions(ctx, {
          grantType: GrantType.ClientCredential,
          tenantId: "tenantId",
          clientId: "test-client-id",
          audience: "https://no-grant-api.example.com",
          requestedScopes: ["read:data"],
        });

        expect(result).toEqual({
          scopes: [],
          permissions: [],
        });

        // Clean up
        await env.data.resourceServers.remove("tenantId", resourceServer.id!);
      });

      it("should return all granted scopes but no permissions when RBAC is disabled for client_credentials", async () => {
        const { env } = await getTestServer();
        const ctx = {
          env,
          var: {},
        } as Context<{
          Bindings: Bindings;
          Variables: Variables;
        }>;

        // Create a resource server with RBAC disabled
        const resourceServer = await env.data.resourceServers.create(
          "tenantId",
          {
            identifier: "https://no-rbac-api.example.com",
            name: "No RBAC API",
            scopes: [
              { value: "read:data", description: "Read data" },
              { value: "write:data", description: "Write data" },
            ],
            options: {
              enforce_policies: false, // RBAC disabled
              token_dialect: "access_token",
            },
          },
        );

        // Create a test client
        await env.data.clients.create("tenantId", {
          client_id: "test-client-id",
          name: "Test Client",
        });

        // Create a client grant with both scopes
        await env.data.clientGrants.create("tenantId", {
          client_id: "test-client-id",
          audience: "https://no-rbac-api.example.com",
          scope: ["read:data", "write:data"],
        });

        const result = await calculateScopesAndPermissions(ctx, {
          grantType: GrantType.ClientCredential,
          tenantId: "tenantId",
          clientId: "test-client-id",
          audience: "https://no-rbac-api.example.com",
          requestedScopes: ["read:data"], // Only requesting one scope
        });

        // Auth0 behavior: when scopes ARE requested, return intersection of requested and granted
        expect(result).toEqual({
          scopes: ["read:data"], // Only the requested scope (intersection)
          permissions: [], // No permissions when RBAC is disabled
        });

        // Clean up
        await env.data.resourceServers.remove("tenantId", resourceServer.id!);
      });

      it("should throw 403 for unauthorized scopes even when RBAC is disabled", async () => {
        const { env } = await getTestServer();
        const ctx = {
          env,
          var: {},
        } as Context<{
          Bindings: Bindings;
          Variables: Variables;
        }>;

        // Create a resource server with RBAC disabled
        const resourceServer = await env.data.resourceServers.create(
          "tenantId",
          {
            identifier: "https://no-rbac-unauthorized-api.example.com",
            name: "No RBAC Unauthorized API",
            scopes: [
              { value: "read:data", description: "Read data" },
              { value: "write:data", description: "Write data" },
              { value: "admin:data", description: "Admin data" },
            ],
            options: {
              enforce_policies: false, // RBAC disabled
              token_dialect: "access_token",
            },
          },
        );

        // Create a test client
        await env.data.clients.create("tenantId", {
          client_id: "test-client-id",
          name: "Test Client",
        });

        // Create a client grant with limited scopes
        await env.data.clientGrants.create("tenantId", {
          client_id: "test-client-id",
          audience: "https://no-rbac-unauthorized-api.example.com",
          scope: ["read:data", "write:data"], // admin:data is NOT granted
        });

        // Auth0 behavior: requesting unauthorized scope throws 403 even with RBAC disabled
        await expect(
          calculateScopesAndPermissions(ctx, {
            grantType: GrantType.ClientCredential,
            tenantId: "tenantId",
            clientId: "test-client-id",
            audience: "https://no-rbac-unauthorized-api.example.com",
            requestedScopes: ["read:data", "admin:data"], // admin:data is unauthorized
          }),
        ).rejects.toThrow();

        // Clean up
        await env.data.resourceServers.remove("tenantId", resourceServer.id!);
      });
    });
  });
});
