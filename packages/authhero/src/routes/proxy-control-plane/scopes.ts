import { PROXY_RESOLVE_HOST_SCOPE } from "@authhero/proxy";

/**
 * Scope carried by the tokens `ControlPlaneSyncDestination` mints for
 * `POST /api/v2/proxy/control-plane/sync`.
 */
export const CONTROL_PLANE_SYNC_SCOPE = "controlplane:sync";

/**
 * Scope required by the authoritative `/custom-domains` resource on the
 * control plane. Tenant shards mint a token with this scope through
 * `createControlPlaneCustomDomainsAdapter`.
 */
export const CONTROL_PLANE_CUSTOM_DOMAINS_SCOPE = "controlplane:custom_domains";

/**
 * Scope required by the authoritative `/tenant-members` resource on the control
 * plane — a tenant's team (organization membership + org-scoped roles +
 * invitations) that only the control plane can write. Tenant shards mint a
 * token with this scope through `createControlPlaneTenantMembersAdapter`.
 */
export const CONTROL_PLANE_TENANT_MEMBERS_SCOPE = "controlplane:tenant_members";

export { PROXY_RESOLVE_HOST_SCOPE };
