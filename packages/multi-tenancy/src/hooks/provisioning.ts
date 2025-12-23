import { Tenant } from "@authhero/adapter-interfaces";
import {
  MultiTenancyConfig,
  TenantEntityHooks,
  TenantHookContext,
} from "../types";

/**
 * Creates hooks for tenant provisioning and deprovisioning.
 *
 * This handles:
 * - Creating organizations on the main tenant when a new tenant is created
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
    async afterCreate(ctx: TenantHookContext, tenant: Tenant): Promise<void> {
      const { accessControl, databaseIsolation, settingsInheritance } = config;

      // 1. Create organization on main tenant for access control
      if (accessControl && ctx.ctx) {
        await createOrganizationForTenant(ctx, tenant, accessControl);
      }

      // 2. Provision database if isolation is enabled
      if (databaseIsolation?.onProvision) {
        await databaseIsolation.onProvision(tenant.id);
      }

      // 3. Apply inherited settings if configured
      if (settingsInheritance?.inheritFromMain !== false && ctx.ctx) {
        await applyInheritedSettings(ctx, tenant, config);
      }
    },

    async beforeDelete(
      ctx: TenantHookContext,
      tenantId: string,
    ): Promise<void> {
      const { accessControl, databaseIsolation } = config;

      // 1. Remove organization from main tenant
      if (accessControl) {
        try {
          // Find the organization by name (which matches tenant ID)
          const orgs = await ctx.adapters.organizations.list(
            accessControl.mainTenantId,
          );
          const org = orgs.organizations.find((o) => o.name === tenantId);

          if (org) {
            await ctx.adapters.organizations.remove(
              accessControl.mainTenantId,
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
 * Creates an organization on the main tenant for a new tenant.
 */
async function createOrganizationForTenant(
  ctx: TenantHookContext,
  tenant: Tenant,
  accessControl: NonNullable<MultiTenancyConfig["accessControl"]>,
): Promise<void> {
  const { mainTenantId, defaultPermissions, defaultRoles } = accessControl;

  // Create organization with tenant ID as the organization ID and name
  await ctx.adapters.organizations.create(mainTenantId, {
    id: tenant.id,
    name: tenant.id,
    display_name: tenant.friendly_name || tenant.id,
  });

  // Assign default roles if configured
  if (defaultRoles && defaultRoles.length > 0) {
    // Note: Role assignment would require additional API calls
    // This is a placeholder for the actual implementation
    console.log(
      `Would assign roles ${defaultRoles.join(", ")} to organization ${tenant.id}`,
    );
  }

  // Grant default permissions if configured
  if (defaultPermissions && defaultPermissions.length > 0) {
    // Note: Permission assignment would require additional API calls
    // This is a placeholder for the actual implementation
    console.log(
      `Would grant permissions ${defaultPermissions.join(", ")} to organization ${tenant.id}`,
    );
  }
}

/**
 * Applies inherited settings from the main tenant to a new tenant.
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

  // Get main tenant settings
  const mainTenant = await ctx.adapters.tenants.get(accessControl.mainTenantId);
  if (!mainTenant) {
    return;
  }

  // Determine which settings to inherit
  let inheritedSettings: Partial<Tenant> = { ...mainTenant };

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
      if (key in mainTenant && !systemFields.includes(key)) {
        (filtered as Record<string, unknown>)[key] = mainTenant[key];
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
