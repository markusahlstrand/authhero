import { describe, it, expect } from "vitest";
import { Context } from "hono";
import { calculateScopesAndPermissions } from "../../src/helpers/scopes-permissions";
import { getTestServer } from "../helpers/test-server";
import { Bindings, Variables } from "../../src/types";

describe("scopes-permissions helper", () => {
  describe("calculateScopesAndPermissions", () => {
    it("should return empty arrays when no resource server matches the audience", async () => {
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

      const result = await calculateScopesAndPermissions(ctx, {
        tenantId: "tenantId",
        userId: "userId",
        audience: "https://nonexistent-api.example.com",
        requestedScopes: ["read:users", "write:users"],
      });

      expect(result).toEqual({
        scopes: [],
        permissions: [],
      });
    });

    it("should return requested scopes when RBAC is disabled", async () => {
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
        userId: "userId",
        audience: "https://test-api.example.com",
        requestedScopes: ["read:users", "write:users", "invalid:scope"],
      });

      expect(result).toEqual({
        scopes: ["read:users", "write:users"], // Only valid scopes returned
        permissions: [],
      });

      // Clean up
      await env.data.resourceServers.remove("tenantId", resourceServer.id!);
    });

    it("should return permissions when RBAC is enabled and token_dialect is access_token_authz", async () => {
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
        var: {
          tenant_id: "tenantId",
        },
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
        userId: "testUserId2",
        audience: "https://rbac-scopes-api.example.com",
        requestedScopes: ["read:users", "write:users", "admin:all"],
      });

      expect(result).toEqual({
        scopes: ["read:users"], // Only the scope the user has permission for
        permissions: [],
      });

      // Clean up
      await env.data.resourceServers.remove("tenantId", resourceServer.id!);
    });

    it("should combine direct permissions and role-based permissions", async () => {
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

    it("should throw 403 error when user is not a member of the specified organization", async () => {
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
        var: {
          tenant_id: "tenantId",
        },
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
        var: {
          tenant_id: "tenantId",
        },
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
  });
});
