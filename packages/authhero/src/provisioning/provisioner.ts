import type { Tenant, TenantsDataAdapter } from "@authhero/adapter-interfaces";

export interface TenantProvisionerContext {
  tenants: TenantsDataAdapter;
}

/**
 * Drives a tenant from `provisioning_state: "pending"` to `"ready"` or
 * `"failed"`. Owns whatever side effects are required to make the tenant
 * actually serve traffic — creating a D1, uploading a worker to a dispatch
 * namespace, wiring secrets, etc. — and writes the resulting state back via
 * `ctx.tenants.update(...)`.
 *
 * Contract:
 *  - Implementations MUST be idempotent. The same tenant may be passed in
 *    twice if a previous run crashed mid-flight, the API is retried, or an
 *    operator manually re-triggers provisioning.
 *  - `provision()` MUST resolve (not reject) even on failure. Errors should
 *    be captured into `provisioning_error` and the state set to `"failed"`
 *    so the admin UI can render a useful message.
 *  - `provision()` should be safe to schedule via `ctx.executionCtx.waitUntil`
 *    on Cloudflare Workers — it must not depend on the originating request
 *    surviving.
 */
export interface TenantProvisioner {
  provision(tenant: Tenant, ctx: TenantProvisionerContext): Promise<void>;
}
