/**
 * Structural types for the Cloudflare Workflows engine. Deliberately NOT
 * imported from `cloudflare:workers` / `@cloudflare/workers-types` — this
 * package ships platform-agnostic bundles and the real runtime objects
 * satisfy these shapes structurally (precedent: `@authhero/proxy`'s local
 * binding types). Only the downstream worker's `WorkflowEntrypoint` shell
 * touches `cloudflare:workers` (see `entrypoint.example.ts`).
 */

/**
 * The ONLY data that crosses the enqueue boundary. Workflows persists
 * params (and shows them in the dashboard), so never put secrets here —
 * the workflow re-resolves everything else from its worker env.
 */
export interface TenantOperationWorkflowParams {
  operation_id: string;
  tenant_id: string;
  /** Widened beyond "provision" in later phases (upgrade, backup, …). */
  kind: "provision";
}

/**
 * Instance status as reported by the engine. The exact value set has
 * drifted across Cloudflare releases; the reconciler only branches on the
 * terminal values and treats anything unrecognized as still-running.
 */
export interface WorkflowInstanceStatus {
  status:
    | "queued"
    | "running"
    | "paused"
    | "errored"
    | "terminated"
    | "complete"
    | "waiting"
    | "waitingForPause"
    | "unknown"
    | (string & {});
  error?: { name?: string; message?: string } | string | null;
  output?: unknown;
}

/** Structurally satisfied by the handles a `workflows` binding returns. */
export interface WorkflowInstanceHandle {
  id: string;
  status(): Promise<WorkflowInstanceStatus>;
}

/**
 * Structurally satisfied by a Workflows binding
 * (e.g. `env.TENANT_OPERATIONS_WORKFLOW`).
 */
export interface WorkflowsBinding {
  create(options: {
    id: string;
    params: TenantOperationWorkflowParams;
  }): Promise<WorkflowInstanceHandle>;
  get(id: string): Promise<WorkflowInstanceHandle>;
}

export const TENANT_OPERATION_ENGINE = "cloudflare-workflows";
