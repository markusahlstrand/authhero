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
import {
  ACCESS_ALL_ORGANIZATIONS_PERMISSION,
  userHasGlobalManagementPermission,
} from "../../../helpers/scopes-permissions";

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
 * tenant without being a member of its control-plane org. Scoped to the
 * Management API audience so unrelated API permissions can't satisfy it.
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
        MANAGEMENT_API_AUDIENCE,
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * True when the user holds the global `access:all_organizations` permission
 * (directly or through a role, Management API audience). Such a user may open
 * any control-plane org without being a member, but is NOT a tenant admin:
 * registering a DCR client still needs `create:clients`, which for these
 * users can come from their global roles (#1437).
 */
export async function userHasAccessAllOrganizations(
  context: ScreenContext,
  userId: string,
): Promise<boolean> {
  return userHasGlobalManagementPermission(
    context.ctx,
    context.tenant.id,
    userId,
    ACCESS_ALL_ORGANIZATIONS_PERMISSION,
  );
}

/**
 * True when the user holds `create:clients` at global scope (Management API
 * audience). For a user with `access:all_organizations` this lets them
 * register on any child tenant without an org-scoped role.
 */
export async function userCanRegisterGlobally(
  context: ScreenContext,
  userId: string,
): Promise<boolean> {
  return userHasGlobalManagementPermission(
    context.ctx,
    context.tenant.id,
    userId,
    DCR_REGISTER_PERMISSION,
  );
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
 *  - the user holds global `access:all_organizations` AND `create:clients`
 *    (globally or on that org), with no membership needed, or
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

  if (await userHasAccessAllOrganizations(context, userId)) {
    const allOrganizations = await fetchAll<Organization>(
      (params) => ctx.env.data.organizations.list(controlPlaneTenantId, params),
      "organizations",
    );
    const targetOrg = allOrganizations.find((o) => o.name === targetTenantId);
    if (
      targetOrg &&
      ((await userCanRegisterGlobally(context, userId)) ||
        (await userCanRegisterOnOrg(context, userId, targetOrg.id)))
    ) {
      return true;
    }
    // Not granted through the global list (which fetchAll caps). Fall
    // through to the membership path so the permission never removes access
    // the user already has as a member.
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
