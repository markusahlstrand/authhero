import {
  CreateTenantParams,
  Tenant,
  MANAGEMENT_API_SCOPES,
  MANAGEMENT_API_AUDIENCE,
} from "authhero";

/**
 * Generates the default audience URN for a tenant.
 * @param tenantId - The tenant ID
 * @returns The audience URN in the format `urn:authhero:tenant:{tenantId}`
 */
function getTenantAudience(tenantId: string): string {
  return `urn:authhero:tenant:${tenantId.toLowerCase()}`;
}
import {
  MultiTenancyConfig,
  TenantEntityHooks,
  TenantHookContext,
} from "../types";

/**
 * Creates hooks for tenant provisioning and deprovisioning.
 *
 * This handles:
 * - Setting the correct audience for new tenants (urn:authhero:tenant:{id})
 * - Creating organizations on the control plane when a new tenant is created
 * - Provisioning databases for new tenants
 * - Cleaning up organizations and databases when tenants are deleted
 *
 * @param config - Multi-tenancy configuration
 * @returns Tenant entity hooks for lifecycle events
 */
export function createProvisioningHooks(
  config: MultiTenancyConfig,
): TenantEntityHooks {
  return {
    async beforeCreate(
      _ctx: TenantHookContext,
      params: CreateTenantParams,
    ): Promise<CreateTenantParams> {
      // Set the audience to the tenant-specific URN if not already set
      // This ensures child tenants use urn:authhero:tenant:{id} as their audience
      if (!params.audience && params.id) {
        return {
          ...params,
          audience: getTenantAudience(params.id),
        };
      }
      return params;
    },

    async afterCreate(ctx: TenantHookContext, tenant: Tenant): Promise<void> {
      const { accessControl, databaseIsolation } = config;

      // 1. Create organization on control plane for access control
      if (accessControl && ctx.ctx) {
        await createOrganizationForTenant(ctx, tenant, accessControl);
      }

      // 2. Provision database if isolation is enabled
      if (databaseIsolation?.onProvision) {
        await databaseIsolation.onProvision(tenant.id);
      }
    },

    async beforeDelete(
      ctx: TenantHookContext,
      tenantId: string,
    ): Promise<void> {
      const { accessControl, databaseIsolation } = config;

      // 1. Remove organization from control plane
      if (accessControl) {
        try {
          // Find the organization by name (which matches tenant ID)
          const orgs = await ctx.adapters.organizations.list(
            accessControl.controlPlaneTenantId,
          );
          const org = orgs.organizations.find((o) => o.name === tenantId);

          if (org) {
            await ctx.adapters.organizations.remove(
              accessControl.controlPlaneTenantId,
              org.id,
            );
          }
        } catch (error) {
          console.warn(
            `Failed to remove organization for tenant ${tenantId}:`,
            error,
          );
        }
      }

      // 2. Deprovision database if isolation is enabled
      if (databaseIsolation?.onDeprovision) {
        try {
          await databaseIsolation.onDeprovision(tenantId);
        } catch (error) {
          console.warn(
            `Failed to deprovision database for tenant ${tenantId}:`,
            error,
          );
        }
      }
    },
  };
}

/**
 * Creates an organization on the control plane for a new tenant.
 * Also creates/assigns the admin role and adds the creator to the organization.
 */
async function createOrganizationForTenant(
  ctx: TenantHookContext,
  tenant: Tenant,
  accessControl: NonNullable<MultiTenancyConfig["accessControl"]>,
): Promise<void> {
  const {
    controlPlaneTenantId,
    defaultPermissions,
    defaultRoles,
    issuer,
    adminRoleName = "Tenant Admin",
    adminRoleDescription = "Full access to all tenant management operations",
    addCreatorToOrganization = true,
  } = accessControl;

  // Create organization with tenant ID as the name (let the adapter generate the ID)
  // The org name is used for access control - tokens include org_name which matches tenant ID
  // when allow_organization_name_in_authentication_api is enabled on the tenant
  const organization = await ctx.adapters.organizations.create(
    controlPlaneTenantId,
    {
      name: tenant.id,
      display_name: tenant.friendly_name || tenant.id,
    },
  );

  // Get or create the admin role with all Management API permissions
  // Only create admin role if issuer is provided (per documentation)
  let adminRoleId: string | undefined;
  if (issuer) {
    adminRoleId = await getOrCreateAdminRole(
      ctx,
      controlPlaneTenantId,
      adminRoleName,
      adminRoleDescription,
    );
  }

  // Add the creator to the organization and assign the admin role
  // Skip if the user has admin:organizations permission (they can access any org without membership)
  if (addCreatorToOrganization && ctx.ctx) {
    const user = ctx.ctx.var.user;
    if (user?.sub) {
      // Check if user has admin:organizations at the global level
      const hasGlobalOrgAdmin = await userHasGlobalOrgAdminPermission(
        ctx,
        controlPlaneTenantId,
        user.sub,
      );

      // Only add user to organization if they don't have global admin:organizations
      if (!hasGlobalOrgAdmin) {
        try {
          // Add user to the organization
          await ctx.adapters.userOrganizations.create(controlPlaneTenantId, {
            user_id: user.sub,
            organization_id: organization.id,
          });

          // Assign admin role to the user for this organization (only if role was created)
          if (adminRoleId) {
            await ctx.adapters.userRoles.create(
              controlPlaneTenantId,
              user.sub,
              adminRoleId,
              organization.id, // organizationId
            );
          }
        } catch (error) {
          console.warn(
            `Failed to add creator ${user.sub} to organization ${organization.id}:`,
            error,
          );
        }
      }
    }
  }

  // Assign default roles if configured
  if (defaultRoles && defaultRoles.length > 0) {
    // Note: Role assignment would require additional API calls
    // This is a placeholder for the actual implementation
    console.log(
      `Would assign roles ${defaultRoles.join(", ")} to organization ${organization.id}`,
    );
  }

  // Grant default permissions if configured
  if (defaultPermissions && defaultPermissions.length > 0) {
    // Note: Permission assignment would require additional API calls
    // This is a placeholder for the actual implementation
    console.log(
      `Would grant permissions ${defaultPermissions.join(", ")} to organization ${organization.id}`,
    );
  }
}

/**
 * Checks if a user has the admin:organizations permission at the global (tenant) level.
 * This is used to determine if the user should be added to organizations or not.
 */
async function userHasGlobalOrgAdminPermission(
  ctx: TenantHookContext,
  controlPlaneTenantId: string,
  userId: string,
): Promise<boolean> {
  // Get user's global roles (not organization-scoped)
  const globalRoles = await ctx.adapters.userRoles.list(
    controlPlaneTenantId,
    userId,
    undefined,
    "", // Empty string for global roles
  );

  // Check if any global role has admin:organizations permission
  for (const role of globalRoles) {
    const rolePermissions = await ctx.adapters.rolePermissions.list(
      controlPlaneTenantId,
      role.id,
      { per_page: 1000 },
    );

    const hasAdminOrg = rolePermissions.some(
      (permission) => permission.permission_name === "admin:organizations",
    );

    if (hasAdminOrg) {
      return true;
    }
  }

  return false;
}

/**
 * Gets or creates the admin role with all Management API permissions.
 * Returns the role ID.
 */
async function getOrCreateAdminRole(
  ctx: TenantHookContext,
  controlPlaneTenantId: string,
  roleName: string,
  roleDescription: string,
): Promise<string> {
  // Check if the role already exists
  const existingRoles = await ctx.adapters.roles.list(controlPlaneTenantId, {});
  const existingRole = existingRoles.roles.find((r) => r.name === roleName);

  if (existingRole) {
    return existingRole.id;
  }

  // Create the admin role
  const role = await ctx.adapters.roles.create(controlPlaneTenantId, {
    name: roleName,
    description: roleDescription,
  });

  // Assign all Management API permissions to the role
  // Use the standard management API audience as the identifier
  const managementApiIdentifier = MANAGEMENT_API_AUDIENCE;

  // Convert MANAGEMENT_API_SCOPES to the format expected by rolePermissions.assign
  const permissions = MANAGEMENT_API_SCOPES.map((scope) => ({
    role_id: role.id,
    resource_server_identifier: managementApiIdentifier,
    permission_name: scope.value,
  }));

  await ctx.adapters.rolePermissions.assign(
    controlPlaneTenantId,
    role.id,
    permissions,
  );

  return role.id;
}
