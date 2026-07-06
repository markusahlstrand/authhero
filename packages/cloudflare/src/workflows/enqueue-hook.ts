import type {
  TenantOperation,
  TenantsDataAdapter,
} from "@authhero/adapter-interfaces";
import type {
  WfpTenantProvisioningHook,
  WfpProvisioningStepReporter,
} from "../wfp-provisioner/tenant-hook";

export interface WfpWorkflowProvisioningHookOptions {
  tenants: TenantsDataAdapter;
  /**
   * Enqueues a provision operation on the durable engine — typically
   * `(input) => enqueueTenantOperation(stores, createCloudflareWorkflowsExecutor({ binding }), input)`.
   * Resolves as soon as the engine instance is created.
   */
  enqueueOperation: (input: {
    kind: "provision";
    tenant_id: string;
    initiated_by?: string;
  }) => Promise<TenantOperation>;
  /** Same gate + default as the inline hook: `deployment_type === "wfp"`. */
  shouldProvision?: (tenant: {
    id: string;
    deployment_type?: string;
    storage_kind?: string;
  }) => boolean;
  /**
   * The existing inline hook (`createWfpTenantProvisioningHook(...)`).
   * Upgrade and deprovision keep running inline until later phases make
   * them durable.
   */
  inline: WfpTenantProvisioningHook;
}

/**
 * Drop-in replacement for `createWfpTenantProvisioningHook` on control
 * planes that run provisioning through Cloudflare Workflows (issue #1026
 * phase 2): `onProvision` enqueues a durable provision operation and
 * returns immediately, leaving the tenant `pending` — the workflow's
 * `mark-ready` / `mark-failed` steps own the terminal snapshot writes, and
 * the reconciler covers instances that die mid-run.
 *
 * Semantic change to plan for downstream: tenant-create now returns with
 * `provisioning_state: "pending"`; clients poll the tenant row or the
 * operations API. An enqueue failure still throws, so
 * `createProvisioningHooks.afterCreate` rolls the tenant row back exactly
 * like an inline provision failure does today. This also replaces any
 * best-effort post-create seed — the seed is a durable step inside the
 * workflow.
 *
 * Wire it with `databaseIsolation.recordProvisionOperations: false` — this
 * hook's `enqueueOperation` creates the operation row itself, and the
 * multi-tenancy recording wrapper would otherwise write a second row that
 * gets marked succeeded while the engine run is still in flight.
 */
export function createWfpWorkflowProvisioningHook(
  options: WfpWorkflowProvisioningHookOptions,
): WfpTenantProvisioningHook {
  const shouldProvision =
    options.shouldProvision ??
    ((tenant: { deployment_type?: string }) =>
      tenant.deployment_type === "wfp");

  return {
    async onProvision(
      tenantId: string,
      _report?: WfpProvisioningStepReporter,
    ): Promise<void> {
      const tenant = await options.tenants.get(tenantId);
      if (!tenant) return; // Mid-rollback race — nothing to do.
      if (!shouldProvision(tenant)) return; // Shared deployment, skip.

      // The workflow writes its own step events; the caller's coarse
      // reporter (from runRecordedTenantOperation) is intentionally unused
      // — the durable path creates its own operation row via
      // enqueueOperation.
      await options.enqueueOperation({
        kind: "provision",
        tenant_id: tenantId,
      });
    },

    async onUpgrade(
      tenantId: string,
      report?: WfpProvisioningStepReporter,
    ): Promise<void> {
      await options.inline.onUpgrade(tenantId, report);
    },

    async onDeprovision(tenantId: string): Promise<void> {
      await options.inline.onDeprovision(tenantId);
    },
  };
}
