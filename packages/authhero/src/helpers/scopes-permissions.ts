import { Context } from "hono";
import { ResourceServer, GrantType } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { JSONHTTPException } from "../errors/json-http-exception";

// Base interface with common properties
interface BaseScopesAndPermissionsParams {
  tenantId: string;
  clientId: string;
  audience: string;
  requestedScopes: string[];
  organizationId?: string;
}

// Client credentials grant - no userId required
interface ClientCredentialsScopesAndPermissionsParams extends BaseScopesAndPermissionsParams {
  grantType: GrantType.ClientCredential;
  userId?: never; // Explicitly disallow userId for client_credentials
}

// User-based grants - userId is required
interface UserBasedScopesAndPermissionsParams extends BaseScopesAndPermissionsParams {
  grantType?:
    | GrantType.AuthorizationCode
    | GrantType.RefreshToken
    | GrantType.Password
    | GrantType.Passwordless
    | GrantType.OTP
    | GrantType.TokenExchange
    | undefined;
  userId: string; // Required for user-based grants
}

// Discriminated union
export type CalculateScopesAndPermissionsParams =
  | ClientCredentialsScopesAndPermissionsParams
  | UserBasedScopesAndPermissionsParams;

export interface ScopesAndPermissionsResult {
  scopes: string[];
  permissions: string[];
  token_lifetime: number;
  token_lifetime_for_web: number;
}

// Standard OIDC scopes that are available without a registered resource server.
// `offline_access` is included per OIDC Core 1.0 § 11 — it's a request for a
// refresh token, not tied to any resource server, so it must pass through even
// when the audience has no matching resource server.
const DEFAULT_OIDC_SCOPES = [
  "openid", // Required for OIDC; returns sub claim (user identifier) in ID token
  "profile", // Returns standard profile claims: name, family_name, given_name, nickname, picture, locale, updated_at
  "email", // Returns email and email_verified
  "address", // Returns address claim
  "phone", // Returns phone_number and phone_number_verified
  "offline_access", // OIDC Core § 11 — requests a refresh token
];

interface ClientCredentialsScopesParams {
  tenantId: string;
  clientId: string;
  audience: string;
  requestedScopes: string[];
}

/**
 * Gets tenant-level permissions to inherit in organization contexts when the tenant has
 * the `inherit_global_permissions_in_organizations` flag enabled.
 * This allows users with tenant-level permissions to also have those permissions
 * when accessing organization tokens.
 *
 * @param ctx - The Hono context
 * @param currentTenantId - The tenant ID where the token is being requested
 * @param userId - The user ID to check permissions for
 * @param audience - The audience to filter permissions by
 * @returns Array of permission names that should be inherited
 */
async function getTenantPermissionsForOrganization(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  currentTenantId: string,
  userId: string,
  audience: string,
): Promise<string[]> {
  const permissions: string[] = [];

  // Get the current tenant to check if permission inheritance is enabled
  const currentTenant = await ctx.env.data.tenants.get(currentTenantId);

  // Only inherit tenant-level permissions if the flag is enabled
  if (!currentTenant?.flags?.inherit_global_permissions_in_organizations) {
    return [];
  }

  // Get user's tenant-level roles (not organization-scoped)
  const tenantRoles = await ctx.env.data.userRoles.list(
    currentTenantId,
    userId,
    undefined,
    "", // Empty string for tenant-level (global) roles
  );

  // Get permissions from each role - one parallel batch
  const rolePermissionLists = await Promise.all(
    tenantRoles.map((role) =>
      ctx.env.data.rolePermissions.list(currentTenantId, role.id, {
        per_page: 1000,
      }),
    ),
  );
  for (const rolePermissions of rolePermissionLists) {
    // Add permissions that match the requested audience
    rolePermissions.forEach((permission) => {
      if (permission.resource_server_identifier === audience) {
        permissions.push(permission.permission_name);
      }
    });
  }

  return [...new Set(permissions)]; // Deduplicate
}

/**
 * Calculates scopes and permissions for client_credentials grant type based on client grants.
 *
 * Auth0 behavior for client_credentials:
 * 1. If NO scopes are requested: Return ALL authorized scopes from the client grant
 * 2. If scopes ARE requested: Return intersection of requested and authorized scopes
 * 3. If any requested scope is NOT in the client grant, a 403 error is returned
 * 4. When RBAC is enabled with access_token_authz, permissions claim contains the scopes
 *
 * This implementation only considers client grants, the audience, and the resource server configuration.
 */
async function calculateClientCredentialsScopes(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: ClientCredentialsScopesParams,
): Promise<ScopesAndPermissionsResult> {
  const { tenantId, clientId, audience, requestedScopes } = params;

  // Handle default OIDC scopes first - these are always available
  const defaultOidcScopes = requestedScopes.filter((scope) =>
    DEFAULT_OIDC_SCOPES.includes(scope),
  );

  // Non-OIDC requested scopes that need to be validated against client grants
  const nonOidcRequestedScopes = requestedScopes.filter(
    (scope) => !DEFAULT_OIDC_SCOPES.includes(scope),
  );

  // Get all resource servers for the tenant
  const resourceServersResponse =
    await ctx.env.data.resourceServers.list(tenantId);

  // Find resource servers that match the audience
  const matchingResourceServers =
    resourceServersResponse.resource_servers.filter(
      (rs: ResourceServer) => rs.identifier === audience,
    );

  if (matchingResourceServers.length === 0) {
    // No matching resource servers found - return only default OIDC scopes
    return {
      scopes: defaultOidcScopes,
      permissions: [],
      token_lifetime: 86400,
      token_lifetime_for_web: 7200,
    };
  }

  const resourceServer = matchingResourceServers[0];
  if (!resourceServer) {
    return {
      scopes: defaultOidcScopes,
      permissions: [],
      token_lifetime: 86400,
      token_lifetime_for_web: 7200,
    };
  }

  const rbacEnabled = resourceServer.options?.enforce_policies === true;
  const tokenDialect = resourceServer.options?.token_dialect || "access_token";

  // Get client grants for this client
  const clientGrantsResponse = await ctx.env.data.clientGrants.list(tenantId, {
    q: `client_id:"${clientId}"`,
  });

  // Filter by audience
  const clientGrant = clientGrantsResponse.client_grants.find(
    (grant) => grant.audience === audience,
  );

  if (!clientGrant) {
    // No client grant found for this client and audience
    return {
      scopes: defaultOidcScopes,
      permissions: [],
      token_lifetime: resourceServer.token_lifetime,
      token_lifetime_for_web: resourceServer.token_lifetime_for_web,
    };
  }

  const grantedScopes = clientGrant.scope || [];
  const definedScopes = (resourceServer.scopes || []).map(
    (scope) => scope.value,
  );

  // Auth0 behavior: If any non-OIDC requested scope is NOT in the client grant, return 403
  // This validates that the client is authorized for all requested scopes
  if (nonOidcRequestedScopes.length > 0) {
    const unauthorizedScopes = nonOidcRequestedScopes.filter(
      (scope) => !grantedScopes.includes(scope),
    );

    if (unauthorizedScopes.length > 0) {
      throw new JSONHTTPException(403, {
        error: "access_denied",
        error_description: `Client is not authorized for scope(s): ${unauthorizedScopes.join(", ")}`,
      });
    }
  }

  // All granted scopes that are defined on the resource server
  const allGrantedScopes = grantedScopes.filter((scope) =>
    definedScopes.includes(scope),
  );

  // Auth0 behavior:
  // - If NO scopes requested at all: return ALL granted scopes
  // - If scopes ARE requested (including OIDC-only): return intersection of
  //   requested non-OIDC scopes and granted scopes. An OIDC-only request such
  //   as `offline_access` must NOT cause the full granted API surface to be
  //   returned.
  const resultScopes =
    requestedScopes.length === 0
      ? allGrantedScopes // No scopes requested - return all granted
      : nonOidcRequestedScopes.filter((scope) =>
          allGrantedScopes.includes(scope),
        ); // Intersection (may be empty when only OIDC scopes were requested)

  const tokenLifetimeFields = {
    token_lifetime: resourceServer.token_lifetime,
    token_lifetime_for_web: resourceServer.token_lifetime_for_web,
  };

  // If RBAC is not enabled, return scopes (no permissions claim)
  if (!rbacEnabled) {
    const allAllowedScopes = [
      ...new Set([...defaultOidcScopes, ...resultScopes]),
    ];
    return {
      scopes: allAllowedScopes,
      permissions: [],
      ...tokenLifetimeFields,
    };
  }

  // RBAC is enabled - permissions are added to the token when token_dialect is access_token_authz
  // For client_credentials, the result scopes become the permissions since there's no user context
  const allowedPermissions = resultScopes;

  if (tokenDialect === "access_token_authz") {
    // For access_token_authz dialect: scopes in scope claim AND permissions in permissions claim
    const allAllowedScopes = [
      ...new Set([...defaultOidcScopes, ...resultScopes]),
    ];
    return {
      scopes: allAllowedScopes,
      permissions: allowedPermissions,
      ...tokenLifetimeFields,
    };
  }

  // For access_token dialect (default): scopes in scope claim, NO permissions claim
  // Auth0 only includes permissions claim when token_dialect is access_token_authz
  const allAllowedScopes = [
    ...new Set([...defaultOidcScopes, ...resultScopes]),
  ];

  return { scopes: allAllowedScopes, permissions: [], ...tokenLifetimeFields };
}

/**
 * Calculates the scopes and permissions for a user based on the audience and resource server configuration.
 * This function implements Auth0-like behavior for RBAC and token dialects.
 *
 * @param ctx - The Hono context
 * @param params - Parameters containing tenant ID, user ID, audience, and requested scopes
 * @returns Object containing calculated scopes and permissions
 */
export async function calculateScopesAndPermissions(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: CalculateScopesAndPermissionsParams,
): Promise<ScopesAndPermissionsResult> {
  // For client_credentials grant, validate using client grants table
  if (params.grantType === GrantType.ClientCredential) {
    return await calculateClientCredentialsScopes(ctx, {
      tenantId: params.tenantId,
      clientId: params.clientId,
      audience: params.audience,
      requestedScopes: params.requestedScopes,
    });
  }

  // For user-based grants, userId is guaranteed to be present due to discriminated union
  const { tenantId, userId, audience, requestedScopes, organizationId } =
    params;

  // Fetch the tenant once — its flags drive both the org-permission-inheritance
  // check below and the scope-filtering posture further down.
  const currentTenant = await ctx.env.data.tenants.get(tenantId);
  const restrictUndefinedScopes =
    currentTenant?.flags?.restrict_undefined_scopes === true;

  // Check if user has admin:organizations permission at global level
  // This allows org admins to get tokens for any organization without membership
  let hasGlobalOrgAdminPermission = false;

  if (organizationId) {
    if (currentTenant?.flags?.inherit_global_permissions_in_organizations) {
      // Check if user has admin:organizations permission at the global level
      const globalRoles = await ctx.env.data.userRoles.list(
        tenantId,
        userId,
        undefined,
        "", // Empty string for tenant-level (global) roles
      );

      // Get permissions from each global role
      for (const role of globalRoles) {
        const rolePermissions = await ctx.env.data.rolePermissions.list(
          tenantId,
          role.id,
          { per_page: 1000 },
        );

        const hasAdminOrg = rolePermissions.some(
          (permission) =>
            permission.permission_name === "admin:organizations" &&
            permission.resource_server_identifier === audience,
        );

        if (hasAdminOrg) {
          hasGlobalOrgAdminPermission = true;
          break;
        }
      }
    }

    // Only check membership if user doesn't have global admin:organizations permission
    if (!hasGlobalOrgAdminPermission) {
      const userOrgs = await ctx.env.data.userOrganizations.list(tenantId, {
        q: `user_id:${userId}`,
        per_page: 1000, // Should be enough for most cases
      });

      const isMember = userOrgs.userOrganizations.some(
        (uo) => uo.organization_id === organizationId,
      );

      if (!isMember) {
        // User is not a member of the organization - throw 403 error
        throw new JSONHTTPException(403, {
          error: "access_denied",
          error_description:
            "User is not a member of the specified organization",
        });
      }
    }
  }

  // Handle default OIDC scopes first - these are always available
  const defaultOidcScopes = requestedScopes.filter((scope) =>
    DEFAULT_OIDC_SCOPES.includes(scope),
  );

  // Get all resource servers for the tenant
  const resourceServersResponse =
    await ctx.env.data.resourceServers.list(tenantId);

  // Find resource servers that match the audience
  const matchingResourceServers =
    resourceServersResponse.resource_servers.filter(
      (rs: ResourceServer) => rs.identifier === audience,
    );

  const resourceServer = matchingResourceServers[0];

  if (!resourceServer) {
    // SECURITY: Without a matching resource server we cannot validate that
    // the caller is authorized for the requested non-OIDC scopes. Returning
    // them unchanged let any authenticated user mint a token carrying
    // arbitrary scopes (e.g. `update:users`) by choosing an unregistered
    // audience — which the management API then accepted via its scope check.
    // OIDC default scopes still flow through so plain login flows that omit
    // a resource server (or rely on tenant.default_audience without one)
    // keep working.
    const nonOidcRequested = requestedScopes.filter(
      (scope) => scope && !DEFAULT_OIDC_SCOPES.includes(scope),
    );
    if (nonOidcRequested.length > 0) {
      throw new JSONHTTPException(403, {
        error: "access_denied",
        error_description: `Service not found: ${audience}`,
      });
    }
    return {
      scopes: defaultOidcScopes,
      permissions: [],
      token_lifetime: 86400,
      token_lifetime_for_web: 7200,
    };
  }

  const definedScopes = (resourceServer.scopes || []).map(
    (scope) => scope.value,
  );
  const rbacEnabled = resourceServer.options?.enforce_policies === true;
  const tokenDialect = resourceServer.options?.token_dialect || "access_token";

  const tokenLifetimeFields = {
    token_lifetime: resourceServer.token_lifetime,
    token_lifetime_for_web: resourceServer.token_lifetime_for_web,
  };

  // If RBAC is not enabled, Auth0's documented default is to echo every
  // requested scope back into the access token's `scope` claim verbatim:
  // "When RBAC is disabled, an application can request any permission
  // defined for the API, and the scope claim includes all requested
  // permissions." Tenants that prefer defense-in-depth can opt into strict
  // filtering — drop scopes not defined on the resource server — via the
  // `restrict_undefined_scopes` flag.
  if (!rbacEnabled) {
    const allowedScopes = restrictUndefinedScopes
      ? requestedScopes.filter(
          (scope) =>
            definedScopes.includes(scope) ||
            DEFAULT_OIDC_SCOPES.includes(scope),
        )
      : requestedScopes;
    return {
      scopes: [...new Set(allowedScopes)],
      permissions: [],
      ...tokenLifetimeFields,
    };
  }

  // RBAC is enabled - fetch the user's direct permissions and roles
  // (global roles use organizationId = "") in parallel; they're independent.
  const [userPermissions, globalRoles, orgRoles] = await Promise.all([
    ctx.env.data.userPermissions.list(
      tenantId,
      userId,
      undefined,
      organizationId, // Pass organizationId to get scoped permissions
    ),
    ctx.env.data.userRoles.list(tenantId, userId, undefined, ""),
    organizationId
      ? ctx.env.data.userRoles.list(tenantId, userId, undefined, organizationId)
      : Promise.resolve([]),
  ]);

  // Combine global and organization-specific roles
  const userRoles = [...globalRoles, ...orgRoles];

  // Check if we should inherit tenant-level permissions in organization context
  // This allows users with tenant-level permissions to also have those permissions in organizations
  const inheritedTenantPermissions = organizationId
    ? await getTenantPermissionsForOrganization(ctx, tenantId, userId, audience)
    : [];

  // Get all permissions from user's roles - one parallel batch, not a
  // round-trip per role
  const rolePermissionLists = await Promise.all(
    userRoles.map((role) =>
      ctx.env.data.rolePermissions.list(
        tenantId,
        role.id,
        { per_page: 1000 }, // Fetch all permissions - roles can have many permissions
      ),
    ),
  );
  const rolePermissions: string[] = [];
  for (const permissions of rolePermissionLists) {
    permissions.forEach((permission) => {
      if (permission.resource_server_identifier === audience) {
        rolePermissions.push(permission.permission_name);
      }
    });
  }

  // Combine direct user permissions and role-based permissions
  const allUserPermissions = new Set<string>();

  // Add direct user permissions
  userPermissions.forEach((permission) => {
    if (permission.resource_server_identifier === audience) {
      allUserPermissions.add(permission.permission_name);
    }
  });

  // Add role-based permissions
  rolePermissions.forEach((permission) => {
    allUserPermissions.add(permission);
  });

  // Add inherited tenant-level permissions (when flag is enabled and in organization context)
  inheritedTenantPermissions.forEach((permission) => {
    allUserPermissions.add(permission);
  });

  const userPermissionsList = Array.from(allUserPermissions);

  // When RBAC is enabled, permissions are calculated based on user's permissions
  // BUT they are only included in the token when token_dialect is access_token_authz
  const allowedPermissions = userPermissionsList.filter((permission) =>
    definedScopes.includes(permission),
  );

  // Scopes NOT defined on the resource server pass through by default — the
  // API doesn't restrict them, matching Auth0's behavior. Tenants that opt
  // into `restrict_undefined_scopes` get them dropped here too, so the
  // posture stays consistent across RBAC-on and RBAC-off.
  const undefinedScopes = restrictUndefinedScopes
    ? []
    : requestedScopes.filter(
        (scope) =>
          !definedScopes.includes(scope) &&
          !DEFAULT_OIDC_SCOPES.includes(scope),
      );

  // If token_dialect is access_token_authz, return permissions directly plus default OIDC scopes and undefined scopes
  if (tokenDialect === "access_token_authz") {
    const allScopes = [...new Set([...defaultOidcScopes, ...undefinedScopes])];
    return {
      scopes: allScopes,
      permissions: allowedPermissions,
      ...tokenLifetimeFields,
    };
  }

  // For access_token dialect (default):
  // - Include OIDC scopes (always available)
  // - Include scopes defined on resource server that user has permission for
  // - Include scopes NOT defined on resource server (pass through)
  // - NO permissions claim (Auth0 only includes it with access_token_authz)
  const resourceServerScopes = requestedScopes.filter(
    (scope) =>
      definedScopes.includes(scope) && userPermissionsList.includes(scope),
  );
  const allAllowedScopes = [
    ...new Set([
      ...defaultOidcScopes,
      ...resourceServerScopes,
      ...undefinedScopes,
    ]),
  ];

  return { scopes: allAllowedScopes, permissions: [], ...tokenLifetimeFields };
}
