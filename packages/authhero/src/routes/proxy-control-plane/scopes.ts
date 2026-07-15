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

export { PROXY_RESOLVE_HOST_SCOPE };
