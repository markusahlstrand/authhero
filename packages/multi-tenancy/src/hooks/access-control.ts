import {
  AccessControlConfig,
  MultiTenancyContext,
  MultiTenancyHooks,
} from "../types";

/**
 * Creates hooks for organization-based tenant access control.
 *
 * This implements the following access model:
 * - Main tenant: Accessible without an organization claim
 * - Child tenants: Require an organization claim matching the tenant ID
 *
 * @param config - Access control configuration
 * @returns Hooks for access validation
 */
export function createAccessControlHooks(
  config: AccessControlConfig,
): Pick<MultiTenancyHooks, "onTenantAccessValidation"> {
  const { mainTenantId, requireOrganizationMatch = true } = config;

  return {
    async onTenantAccessValidation(
      ctx: MultiTenancyContext,
      targetTenantId: string,
    ): Promise<boolean> {
      // Main tenant access - no organization required
      if (targetTenantId === mainTenantId) {
        // For main tenant, we allow access without org claim
        // The user just needs to be authenticated
        return true;
      }

      // For child tenants, check organization claim
      if (requireOrganizationMatch) {
        const organizationId = ctx.var.organization_id;

        // If no organization claim, deny access to child tenants
        if (!organizationId) {
          return false;
        }

        // Organization must match the target tenant
        return organizationId === targetTenantId;
      }

      // If organization matching is disabled, allow access
      return true;
    },
  };
}

/**
 * Validates that a token can access a specific tenant based on its organization claim.
 *
 * @param organizationId - The organization ID from the token (may be undefined)
 * @param targetTenantId - The tenant ID being accessed
 * @param mainTenantId - The main/management tenant ID
 * @returns true if access is allowed
 */
export function validateTenantAccess(
  organizationId: string | undefined,
  targetTenantId: string,
  mainTenantId: string,
): boolean {
  // Main tenant is always accessible (for management operations)
  if (targetTenantId === mainTenantId) {
    return true;
  }

  // Child tenants require matching organization
  if (!organizationId) {
    return false;
  }

  return organizationId === targetTenantId;
}
