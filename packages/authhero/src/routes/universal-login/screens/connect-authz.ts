/**
 * Shared authorization helpers for the DCR connect flow.
 *
 * Both the tenant picker (`connect-tenant-select`) and the consent step
 * (`connect-consent`) must agree on whether a user is allowed to mint an
 * Initial Access Token against a given child tenant. Keeping the logic here
 * — instead of duplicating it per screen — prevents the two from drifting
 * (e.g. the picker honoring the global-admin escape hatch while the consent
 * step only checks plain org membership).
 *
 * Each child tenant is represented on the control plane by an organization
 * whose `name` matches the child tenant id (see @authhero/multi-tenancy
 * provisioning hooks).
 */

import type { Organization } from "@authhero/adapter-interfaces";
import type { ScreenContext } from "./types";
import { fetchAll } from "../../../utils/fetchAll";
import { MANAGEMENT_API_AUDIENCE } from "../../../middlewares/authentication";

// Permission required on a child tenant's control-plane org for the user to
// register a DCR client against that tenant. Mirrors the Management API
// scope a caller would need to POST /clients directly.
export const DCR_REGISTER_PERMISSION = "create:clients";

async function roleGrantsManagementPermission(
  context: ScreenContext,
  roleId: string,
  permissionName: string,
  audience: string | null,
): Promise<boolean> {
  const { ctx, tenant } = context;
  const permissions = await ctx.env.data.rolePermissions.list(
    tenant.id,
    roleId,
    { per_page: 1000 },
  );
  return permissions.some(
    (p) =>
      p.permission_name === permissionName &&
      (audience === null || p.resource_server_identifier === audience),
  );
}

/**
 * Mirrors @authhero/multi-tenancy's escape hatch: a user holding
 * `admin:organizations` on a global (non-org-scoped) role can act on any
 * tenant without being a member of its control-plane org.
 */
export async function userHasGlobalOrgAdmin(
  context: ScreenContext,
  userId: string,
): Promise<boolean> {
  const { ctx, tenant } = context;
  const globalRoles = await ctx.env.data.userRoles.list(
    tenant.id,
    userId,
    undefined,
    "",
  );
  for (const role of globalRoles) {
    if (
      await roleGrantsManagementPermission(
        context,
        role.id,
        "admin:organizations",
        null,
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * True when the user holds the DCR register permission on the given
 * control-plane organization (scoped to the Management API audience).
 */
export async function userCanRegisterOnOrg(
  context: ScreenContext,
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const { ctx, tenant } = context;
  const roles = await ctx.env.data.userRoles.list(
    tenant.id,
    userId,
    undefined,
    organizationId,
  );
  for (const role of roles) {
    if (
      await roleGrantsManagementPermission(
        context,
        role.id,
        DCR_REGISTER_PERMISSION,
        MANAGEMENT_API_AUDIENCE,
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Single source of truth for "may this user mint an IAT against this child
 * tenant?". Used both to build the picker's option list and to re-validate
 * the user's pick at consent time, so the two can never disagree.
 *
 * Access is granted when either:
 *  - the user holds the global `admin:organizations` escape hatch, or
 *  - the user is a member of the control-plane org whose `name` equals the
 *    target tenant id AND holds `create:clients` on their role for that org.
 *
 * The control plane itself is never a valid DCR target.
 */
export async function userCanRegisterOnTenant(
  context: ScreenContext,
  userId: string,
  targetTenantId: string,
): Promise<boolean> {
  const { ctx, tenant } = context;
  const controlPlaneTenantId = tenant.id;

  // DCR targets child tenants only — never the control plane itself.
  if (targetTenantId === controlPlaneTenantId) {
    return false;
  }

  if (await userHasGlobalOrgAdmin(context, userId)) {
    return true;
  }

  const organizations = await fetchAll<Organization>(
    (params) =>
      ctx.env.data.userOrganizations.listUserOrganizations(
        controlPlaneTenantId,
        userId,
        params,
      ),
    "organizations",
  );

  const org = organizations.find((o) => o.name === targetTenantId);
  if (!org) {
    return false;
  }

  return userCanRegisterOnOrg(context, userId, org.id);
}
