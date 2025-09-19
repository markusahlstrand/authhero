import { Context } from "hono";
import { ResourceServer } from "@authhero/adapter-interfaces";
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
interface ClientCredentialsScopesAndPermissionsParams
  extends BaseScopesAndPermissionsParams {
  grantType: "client_credentials";
  userId?: never; // Explicitly disallow userId for client_credentials
}

// User-based grants - userId is required
interface UserBasedScopesAndPermissionsParams
  extends BaseScopesAndPermissionsParams {
  grantType?:
    | "authorization_code"
    | "refresh_token"
    | "password"
    | "passwordless"
    | "http://auth0.com/oauth/grant-type/passwordless/otp"
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
}

// Standard OIDC scopes that are available by default
const DEFAULT_OIDC_SCOPES = [
  "openid", // Required for OIDC; returns sub claim (user identifier) in ID token
  "profile", // Returns standard profile claims: name, family_name, given_name, nickname, picture, locale, updated_at
  "email", // Returns email and email_verified
  "address", // Returns address claim
  "phone", // Returns phone_number and phone_number_verified
];

interface ClientCredentialsScopesParams {
  tenantId: string;
  clientId: string;
  audience: string;
  requestedScopes: string[];
}

/**
 * Calculates scopes and permissions for client_credentials grant type based on client grants.
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
    return { scopes: defaultOidcScopes, permissions: [] };
  }

  const resourceServer = matchingResourceServers[0];
  if (!resourceServer) {
    return { scopes: defaultOidcScopes, permissions: [] };
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
    return { scopes: defaultOidcScopes, permissions: [] };
  }

  const grantedScopes = clientGrant.scope || [];
  const definedScopes = (resourceServer.scopes || []).map(
    (scope) => scope.value,
  );

  // If RBAC is not enabled, return requested scopes that are both:
  // 1. Defined on the resource server
  // 2. Granted to the client via client grants
  if (!rbacEnabled) {
    const allowedScopes = requestedScopes.filter(
      (scope) => definedScopes.includes(scope) && grantedScopes.includes(scope),
    );
    const allAllowedScopes = [
      ...new Set([...defaultOidcScopes, ...allowedScopes]),
    ];
    return { scopes: allAllowedScopes, permissions: [] };
  }

  // RBAC is enabled - permissions are based on the granted scopes in the client grant
  // For client_credentials, we consider the granted scopes as permissions since there's no user context

  if (tokenDialect === "access_token_authz") {
    // Return permissions that are defined as scopes on the resource server and granted to the client
    const allowedPermissions = grantedScopes.filter((scope) =>
      definedScopes.includes(scope),
    );
    return { scopes: defaultOidcScopes, permissions: allowedPermissions };
  }

  // For access_token dialect, return scopes that are requested, defined, and granted
  const allowedScopes = requestedScopes.filter(
    (scope) => definedScopes.includes(scope) && grantedScopes.includes(scope),
  );
  const allAllowedScopes = [
    ...new Set([...defaultOidcScopes, ...allowedScopes]),
  ];

  return { scopes: allAllowedScopes, permissions: [] };
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
  if (params.grantType === "client_credentials") {
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

  if (organizationId) {
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
        error_description: "User is not a member of the specified organization",
      });
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

  if (matchingResourceServers.length === 0) {
    // No matching resource servers found - return only default OIDC scopes
    return { scopes: defaultOidcScopes, permissions: [] };
  }

  const resourceServer = matchingResourceServers[0];
  if (!resourceServer) {
    return { scopes: defaultOidcScopes, permissions: [] };
  }

  const definedScopes = (resourceServer.scopes || []).map(
    (scope) => scope.value,
  );
  const rbacEnabled = resourceServer.options?.enforce_policies === true;
  const tokenDialect = resourceServer.options?.token_dialect || "access_token";

  // If RBAC is not enabled, return requested scopes that are defined on the resource server plus default OIDC scopes
  if (!rbacEnabled) {
    const resourceServerScopes = requestedScopes.filter((scope) =>
      definedScopes.includes(scope),
    );
    const allAllowedScopes = [
      ...new Set([...defaultOidcScopes, ...resourceServerScopes]),
    ];
    return { scopes: allAllowedScopes, permissions: [] };
  }

  // RBAC is enabled - get user's permissions
  const userPermissions = await ctx.env.data.userPermissions.list(
    tenantId,
    userId,
    undefined,
    organizationId, // Pass organizationId to get scoped permissions
  );

  // Get user roles - global roles (organizationId = "") or organization-specific roles
  const globalRoles = await ctx.env.data.userRoles.list(
    tenantId,
    userId,
    undefined,
    "",
  );
  const orgRoles = organizationId
    ? await ctx.env.data.userRoles.list(
        tenantId,
        userId,
        undefined,
        organizationId,
      )
    : [];

  // Combine global and organization-specific roles
  const userRoles = [...globalRoles, ...orgRoles];

  // Get all permissions from user's roles
  const rolePermissions: string[] = [];
  for (const role of userRoles) {
    const permissions = await ctx.env.data.rolePermissions.list(
      tenantId,
      role.id,
    );
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

  const userPermissionsList = Array.from(allUserPermissions);

  // If token_dialect is access_token_authz, return permissions directly plus default OIDC scopes
  if (tokenDialect === "access_token_authz") {
    // Return all permissions the user has access to that are defined as scopes on the resource server
    const allowedPermissions = userPermissionsList.filter((permission) =>
      definedScopes.includes(permission),
    );
    return { scopes: defaultOidcScopes, permissions: allowedPermissions };
  }

  // For access_token dialect, return scopes that the user has permission for plus default OIDC scopes
  const resourceServerScopes = requestedScopes.filter(
    (scope) =>
      definedScopes.includes(scope) && userPermissionsList.includes(scope),
  );
  const allAllowedScopes = [
    ...new Set([...defaultOidcScopes, ...resourceServerScopes]),
  ];

  return { scopes: allAllowedScopes, permissions: [] };
}
