import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { calculateScopesAndPermissions } from "../../src/helpers/scopes-permissions";
import { Context } from "hono";
import { Bindings, Variables } from "../../src/types";

describe("permissions in access token", () => {
  it("demonstrates that permissions are computed but not included in access tokens for access_token_authz dialect", async () => {
    const { env } = await getTestServer();
    const ctx = {
      env,
      var: {
        tenant_id: "tenantId",
        custom_domain: undefined,
      },
    } as Context<{
      Bindings: Bindings;
      Variables: Variables;
    }>;

    // Create a resource server with access_token_authz dialect
    await env.data.resourceServers.create("tenantId", {
      name: "Test API with Permissions",
      identifier: "https://permissions-api.example.com",
      scopes: [
        { value: "read:users", description: "Read users" },
        { value: "write:users", description: "Write users" },
        { value: "delete:users", description: "Delete users" },
      ],
      options: {
        enforce_policies: true, // RBAC enabled
        token_dialect: "access_token_authz", // Should return permissions in token
      },
    });

    // Create a user
    const user = await env.data.users.create("tenantId", {
      user_id: "test-user-123",
      email: "test@example.com",
      name: "Test User",
      connection: "email",
      provider: "auth2",
      is_social: false,
      email_verified: true,
    });

    // Give user direct permissions
    await env.data.userPermissions.create("tenantId", user.user_id, {
      user_id: user.user_id,
      resource_server_identifier: "https://permissions-api.example.com",
      permission_name: "read:users",
    });

    await env.data.userPermissions.create("tenantId", user.user_id, {
      user_id: user.user_id,
      resource_server_identifier: "https://permissions-api.example.com",
      permission_name: "write:users",
    });

    // Verify that calculateScopesAndPermissions correctly computes permissions
    const scopesAndPermissions = await calculateScopesAndPermissions(ctx, {
      tenantId: "tenantId",
      userId: user.user_id,
      audience: "https://permissions-api.example.com",
      requestedScopes: ["read:users", "write:users", "delete:users"],
    });

    // For access_token_authz dialect, permissions should be computed
    expect(scopesAndPermissions.permissions).toEqual([
      "read:users",
      "write:users",
    ]);
    expect(scopesAndPermissions.scopes).toEqual([]);
  });
});
