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
 *   - org_name (organization name) takes precedence and should match tenant ID
 *   - org_id (organization ID) is checked as fallback
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
        // org_name takes precedence - it contains the organization name which matches tenant ID
        // This is set when allow_organization_name_in_authentication_api is enabled
        const orgName = ctx.var.org_name;
        const organizationId = ctx.var.organization_id;

        // Use org_name if available, otherwise fall back to organization_id
        const orgIdentifier = orgName || organizationId;

        // If no organization claim, deny access to child tenants
        if (!orgIdentifier) {
          return false;
        }

        // Organization name/id must match the target tenant
        return orgIdentifier === targetTenantId;
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
 * @param orgName - The organization name from the token (may be undefined, takes precedence)
 * @param targetTenantId - The tenant ID being accessed
 * @param mainTenantId - The main/management tenant ID
 * @returns true if access is allowed
 */
export function validateTenantAccess(
  organizationId: string | undefined,
  targetTenantId: string,
  mainTenantId: string,
  orgName?: string,
): boolean {
  // Main tenant is always accessible (for management operations)
  if (targetTenantId === mainTenantId) {
    return true;
  }

  // Use org_name if available (matches tenant ID), otherwise fall back to organization_id
  const orgIdentifier = orgName || organizationId;

  // Child tenants require matching organization
  if (!orgIdentifier) {
    return false;
  }

  return orgIdentifier === targetTenantId;
}
