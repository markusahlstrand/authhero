/**
 * Durable tenant lifecycle operations on Cloudflare Workflows
 * (issue #1026 phase 2). The control-plane database is the source of
 * truth; the engine is the executor — the workflow writes back to the
 * `tenant_operations` / `tenant_operation_events` log at every step
 * boundary, and `reconcileTenantOperations` sweeps up instances that died
 * before their terminal write.
 *
 * Requires the optional `@authhero/multi-tenancy` peer (like `./wfp`).
 * Nothing here imports `cloudflare:workers`: the downstream worker
 * provides the ~10-line `WorkflowEntrypoint` shell (see
 * `entrypoint.example.ts`) whose `WorkflowStep` satisfies `StepRunner`
 * structurally.
 */
export {
  runProvisionOperation,
  type ProvisionOperationDeps,
  type ProvisionStepName,
} from "./provision-operation";
export {
  createProvisionVerifier,
  TenantProvisionVerificationError,
  type ProvisionVerifierOptions,
} from "./verify";
export {
  createCloudflareWorkflowsExecutor,
  type CloudflareWorkflowsExecutorOptions,
} from "./executor";
export {
  reconcileTenantOperations,
  type ReconcileTenantOperationsOptions,
  type ReconcileTenantOperationsResult,
} from "./reconcile";
export {
  createWfpWorkflowProvisioningHook,
  type WfpWorkflowProvisioningHookOptions,
} from "./enqueue-hook";
export {
  TENANT_OPERATION_ENGINE,
  type TenantOperationWorkflowParams,
  type WorkflowInstanceHandle,
  type WorkflowInstanceStatus,
  type WorkflowsBinding,
} from "./types";
