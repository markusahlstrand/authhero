import { CreateTenantParams, Tenant } from "@authhero/adapter-interfaces";
import { MANAGEMENT_API_SCOPES, getTenantAudience } from "authhero";
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
      const { accessControl, databaseIsolation, settingsInheritance } = config;

      // 1. Create organization on control plane for access control
      if (accessControl && ctx.ctx) {
        await createOrganizationForTenant(ctx, tenant, accessControl);
      }

      // 2. Provision database if isolation is enabled
      if (databaseIsolation?.onProvision) {
        await databaseIsolation.onProvision(tenant.id);
      }

      // 3. Apply inherited settings if configured
      if (settingsInheritance?.inheritFromControlPlane !== false && ctx.ctx) {
        await applyInheritedSettings(ctx, tenant, config);
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

  // Get or create the admin role if issuer is provided
  let adminRoleId: string | null = null;
  if (issuer) {
    adminRoleId = await getOrCreateAdminRole(
      ctx,
      controlPlaneTenantId,
      issuer,
      adminRoleName,
      adminRoleDescription,
    );
  }

  // Add the creator to the organization and assign the admin role
  if (addCreatorToOrganization && ctx.ctx) {
    const user = ctx.ctx.var.user;
    if (user?.sub) {
      try {
        // Add user to the organization
        await ctx.adapters.userOrganizations.create(controlPlaneTenantId, {
          user_id: user.sub,
          organization_id: organization.id,
        });

        // Assign admin role to the user for this organization if we have one
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
 * Gets or creates the admin role with all Management API permissions.
 * Returns the role ID.
 */
async function getOrCreateAdminRole(
  ctx: TenantHookContext,
  controlPlaneTenantId: string,
  issuer: string,
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
  const managementApiIdentifier = `${issuer}api/v2/`;

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

/**
 * Applies inherited settings from the control plane to a new tenant.
 */
async function applyInheritedSettings(
  ctx: TenantHookContext,
  tenant: Tenant,
  config: MultiTenancyConfig,
): Promise<void> {
  const { accessControl, settingsInheritance } = config;

  if (!accessControl) {
    return;
  }

  // Get control plane settings
  const controlPlane = await ctx.adapters.tenants.get(
    accessControl.controlPlaneTenantId,
  );
  if (!controlPlane) {
    return;
  }

  // Determine which settings to inherit
  let inheritedSettings: Partial<Tenant> = { ...controlPlane };

  // Remove system fields that should never be inherited
  const systemFields: (keyof Tenant)[] = [
    "id",
    "created_at",
    "updated_at",
    // Tenant-specific required fields that should not be inherited
    "friendly_name",
    "audience",
    "sender_email",
    "sender_name",
  ];

  for (const field of systemFields) {
    delete inheritedSettings[field];
  }

  // Apply include list if configured
  if (settingsInheritance?.inheritedKeys) {
    const filtered: Partial<Tenant> = {};
    for (const key of settingsInheritance.inheritedKeys) {
      if (key in controlPlane && !systemFields.includes(key)) {
        (filtered as Record<string, unknown>)[key] = controlPlane[key];
      }
    }
    inheritedSettings = filtered;
  }

  // Apply exclude list if configured
  if (settingsInheritance?.excludedKeys) {
    for (const key of settingsInheritance.excludedKeys) {
      delete inheritedSettings[key];
    }
  }

  // Apply custom transformation if configured
  if (settingsInheritance?.transformSettings) {
    inheritedSettings = settingsInheritance.transformSettings(
      inheritedSettings,
      tenant.id,
    );
  }

  // Update tenant with inherited settings
  if (Object.keys(inheritedSettings).length > 0) {
    await ctx.adapters.tenants.update(tenant.id, inheritedSettings);
  }
}
