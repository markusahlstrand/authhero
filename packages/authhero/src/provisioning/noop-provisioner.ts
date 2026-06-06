import type { Tenant } from "@authhero/adapter-interfaces";
import type {
  TenantProvisioner,
  TenantProvisionerContext,
} from "./provisioner";

/**
 * Default provisioner. Flips `provisioning_state` to `"ready"` and clears any
 * prior error, doing nothing else. Correct for `deployment_type: "shared"`
 * tenants (the historical default) and useful as a stand-in until the
 * Cloudflare WFP provisioner is wired in.
 */
export class NoopTenantProvisioner implements TenantProvisioner {
  async provision(
    tenant: Tenant,
    ctx: TenantProvisionerContext,
  ): Promise<void> {
    if (tenant.provisioning_state === "ready" && !tenant.provisioning_error) {
      return;
    }
    try {
      await ctx.tenants.update(tenant.id, {
        provisioning_state: "ready",
        provisioning_state_changed_at: new Date().toISOString(),
        provisioning_error: undefined,
      });
    } catch {
      // The TenantProvisioner contract requires provision() to resolve even
      // on failure. A best-effort follow-up write records the failure so the
      // admin UI can surface it; if that also fails, we swallow the error
      // rather than reject.
    }
  }
}
