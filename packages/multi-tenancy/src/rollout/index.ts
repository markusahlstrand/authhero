import {
  DefaultsProjectionConfig,
  DefaultsProjectionResult,
  projectControlPlaneDefaults,
} from "./defaults-projection";

export type {
  DefaultsProjectionConfig,
  DefaultsProjectionEntities,
  DefaultsProjectionResult,
  EntityProjectionOutcome,
  ProjectableDefaults,
} from "./defaults-projection";
export { projectControlPlaneDefaults } from "./defaults-projection";

export type {
  ControlPlaneDefaultsPayload,
  ControlPlaneDefaultsApplyResult,
  DefaultsPayloadEntities,
} from "./payload";
export {
  buildControlPlaneDefaultsPayload,
  applyControlPlaneDefaultsPayload,
} from "./payload";

/**
 * A control plane rollout applies the control plane's state to one or more
 * tenant databases. `syncDefaults` is the only operation today; schema
 * migrations and tenant worker code deploys are the same shape (enumerate
 * tenants, apply per-tenant, retry, resume) and will become sibling methods.
 *
 * The interface is the seam for execution strategy. The direct implementation
 * runs inline — right for a single pilot tenant. A future Cloudflare Workflows
 * implementation will satisfy the same interface with durable, retryable,
 * resumable fan-out, with no change to callers.
 */
export interface ControlPlaneRolloutAdapter {
  /** Project the control plane defaults into a single tenant's database. */
  syncDefaults(targetTenantId: string): Promise<DefaultsProjectionResult>;

  /**
   * Project the defaults into several tenants. The direct implementation runs
   * them sequentially; a Workflows implementation fans out durably.
   */
  syncDefaultsToTenants(
    targetTenantIds: string[],
  ): Promise<DefaultsProjectionResult[]>;
}

/**
 * Creates a rollout adapter that executes projections inline in the current
 * process. Use this to validate the model with a single tenant before moving to
 * a durable Cloudflare Workflows implementation.
 */
export function createDirectRolloutAdapter(
  config: DefaultsProjectionConfig,
): ControlPlaneRolloutAdapter {
  return {
    syncDefaults: (targetTenantId) =>
      projectControlPlaneDefaults(config, targetTenantId),

    syncDefaultsToTenants: async (targetTenantIds) => {
      const results: DefaultsProjectionResult[] = [];
      for (const tenantId of targetTenantIds) {
        results.push(await projectControlPlaneDefaults(config, tenantId));
      }
      return results;
    },
  };
}
