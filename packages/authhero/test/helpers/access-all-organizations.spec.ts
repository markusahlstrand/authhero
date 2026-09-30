import { describe, it, expect } from "vitest";
import { Context } from "hono";
import {
  AuthorizationResponseType,
  GrantType,
} from "@authhero/adapter-interfaces";
import {
  calculateScopesAndPermissions,
  userCanAccessAllOrganizations,
  userCanAccessOrganization,
} from "../../src/helpers/scopes-permissions";
import { completeLogin } from "../../src/authentication-flows/common";
import { getEnrichedClient } from "../../src/helpers/client";
import { getTestServer } from "./test-server";
import { Bindings, Variables } from "../../src/types";

const TENANT_ID = "tenantId";
const MANAGEMENT_AUDIENCE = "urn:authhero:management";
const APP_AUDIENCE = "https://portal-api.example.com";

type Env = Awaited<ReturnType<typeof getTestServer>>["env"];

function makeCtx(
  env: Env,
): Context<{ Bindings: Bindings; Variables: Variables }> {
  // Minimal context: the helpers only read ctx.env.data.
  return {
    env,
    var: {
      tenant_id: TENANT_ID,
      ip: "127.0.0.1",
      useragent: "test",
      host: "test.auth0.com",
    },
    req: { method: "POST", url: "https://test.auth0.com/oauth/token" },
  } as Context<{ Bindings: Bindings; Variables: Variables }>;
}

async function seedPortal(env: Env) {
  await env.data.resourceServers.create(TENANT_ID, {
    name: "Portal API",
    identifier: APP_AUDIENCE,
    scopes: [
      { value: "read:vendors", description: "Read vendors" },
      { value: "write:vendors", description: "Write vendors" },
    ],
    options: { enforce_policies: true, token_dialect: "access_token_authz" },
  });
  const organization = await env.data.organizations.create(TENANT_ID, {
    name: "publisher-a",
    display_name: "Publisher A",
  });
  return { organization };
}

/**
 * A global role with `permission` on the Management API plus the portal's
 * `read:vendors`, assigned to `userId` at `organizationId` ("" = global).
 */
async function assignRole(
  env: Env,
  userId: string,
  permission: string,
  organizationId = "",
) {
  const role = await env.data.roles.create(TENANT_ID, {
    name: `Role ${permission} ${organizationId || "global"}`,
  });
  await env.data.rolePermissions.assign(TENANT_ID, role.id, [
    {
      role_id: role.id,
      resource_server_identifier: MANAGEMENT_AUDIENCE,
      permission_name: permission,
    },
    {
      role_id: role.id,
      resource_server_identifier: APP_AUDIENCE,
      permission_name: "read:vendors",
    },
  ]);
  await env.data.userRoles.create(TENANT_ID, userId, role.id, organizationId);
  return role;
}

describe("access:all_organizations (#1437)", () => {
  it("issues an org token without membership and carries the global role's permissions", async () => {
    const { env } = await getTestServer();
    const { organization } = await seedPortal(env);
    await assignRole(env, "hqUser", "access:all_organizations");

    // No inherit_global_permissions_in_organizations flag: the permission is
    // the opt-in.
    const tenant = await env.data.tenants.get(TENANT_ID);
    expect(tenant?.flags?.inherit_global_permissions_in_organizations).not.toBe(
      true,
    );

    const result = await calculateScopesAndPermissions(makeCtx(env), {
      grantType: GrantType.AuthorizationCode,
      tenantId: TENANT_ID,
      clientId: "clientId",
      userId: "hqUser",
      audience: APP_AUDIENCE,
      requestedScopes: ["read:vendors"],
      organizationId: organization.id,
    });

    expect(result.permissions).toEqual(["read:vendors"]);
    // The management-plane permission never leaks into the app token.
    expect(result.permissions).not.toContain("access:all_organizations");
  });

  it("works when the permission is assigned directly instead of through a role", async () => {
    const { env } = await getTestServer();
    const { organization } = await seedPortal(env);
    await env.data.userPermissions.create(
      TENANT_ID,
      "directUser",
      {
        user_id: "directUser",
        resource_server_identifier: MANAGEMENT_AUDIENCE,
        permission_name: "access:all_organizations",
      },
      "",
    );

    await expect(
      userCanAccessOrganization(
        makeCtx(env),
        TENANT_ID,
        "directUser",
        organization.id,
      ),
    ).resolves.toBe(true);
  });

  it("does not bypass membership when the permission is only in an org-scoped assignment", async () => {
    const { env } = await getTestServer();
    const { organization } = await seedPortal(env);
    const otherOrg = await env.data.organizations.create(TENANT_ID, {
      name: "publisher-b",
    });
    await assignRole(
      env,
      "orgScopedUser",
      "access:all_organizations",
      otherOrg.id,
    );
    await env.data.userPermissions.create(
      TENANT_ID,
      "orgScopedUser",
      {
        user_id: "orgScopedUser",
        resource_server_identifier: MANAGEMENT_AUDIENCE,
        permission_name: "access:all_organizations",
      },
      otherOrg.id,
    );

    await expect(
      calculateScopesAndPermissions(makeCtx(env), {
        tenantId: TENANT_ID,
        clientId: "clientId",
        userId: "orgScopedUser",
        audience: APP_AUDIENCE,
        requestedScopes: ["read:vendors"],
        organizationId: organization.id,
      }),
    ).rejects.toThrow("User is not a member of the specified organization");
  });

  it("does not bypass membership when the permission is on an app audience", async () => {
    const { env } = await getTestServer();
    const { organization } = await seedPortal(env);
    await env.data.userPermissions.create(
      TENANT_ID,
      "wrongAudienceUser",
      {
        user_id: "wrongAudienceUser",
        resource_server_identifier: APP_AUDIENCE,
        permission_name: "access:all_organizations",
      },
      "",
    );

    await expect(
      userCanAccessOrganization(
        makeCtx(env),
        TENANT_ID,
        "wrongAudienceUser",
        organization.id,
      ),
    ).resolves.toBe(false);
  });

  it("keeps admin:organizations gated on the inherit flag", async () => {
    const { env } = await getTestServer();
    const { organization } = await seedPortal(env);
    await assignRole(env, "legacyAdmin", "admin:organizations");
    const ctx = makeCtx(env);

    // Without the flag, admin:organizations does not bypass membership.
    await expect(
      userCanAccessAllOrganizations(ctx, TENANT_ID, "legacyAdmin"),
    ).resolves.toBe(false);
    await expect(
      calculateScopesAndPermissions(ctx, {
        tenantId: TENANT_ID,
        clientId: "clientId",
        userId: "legacyAdmin",
        audience: APP_AUDIENCE,
        requestedScopes: ["read:vendors"],
        organizationId: organization.id,
      }),
    ).rejects.toThrow("User is not a member of the specified organization");

    // With the flag, it does, exactly as before.
    await env.data.tenants.update(TENANT_ID, {
      flags: { inherit_global_permissions_in_organizations: true },
    });
    const result = await calculateScopesAndPermissions(ctx, {
      tenantId: TENANT_ID,
      clientId: "clientId",
      userId: "legacyAdmin",
      audience: APP_AUDIENCE,
      requestedScopes: ["read:vendors"],
      organizationId: organization.id,
    });
    expect(result.permissions).toEqual(["read:vendors"]);
  });

  it("lets completeLogin (the /authorize path) issue an org token without membership", async () => {
    const { env } = await getTestServer();
    const { organization } = await seedPortal(env);
    const client = await getEnrichedClient(env, "clientId");
    const user = await env.data.users.get(TENANT_ID, "email|userId");
    if (!client || !user) {
      throw new Error("Test setup failed: default client or user not found");
    }

    const loginArgs = {
      authParams: {
        client_id: client.client_id,
        scope: "openid",
        response_type: AuthorizationResponseType.TOKEN,
      },
      client,
      user,
      organization: { id: organization.id, name: organization.name },
      responseType: AuthorizationResponseType.TOKEN,
    };

    // Not a member and no permission: rejected.
    await expect(completeLogin(makeCtx(env), loginArgs)).rejects.toThrow(
      "User is not a member of the specified organization",
    );

    await assignRole(env, user.user_id, "access:all_organizations");
    await expect(completeLogin(makeCtx(env), loginArgs)).resolves.toBeDefined();
  });
});
