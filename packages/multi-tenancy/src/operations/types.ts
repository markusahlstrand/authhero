import {
  TenantOperation,
  TenantOperationEventsAdapter,
  TenantOperationKind,
  TenantOperationsAdapter,
} from "authhero";

/**
 * Structural subset of Cloudflare Workflows' `WorkflowStepConfig`, kept
 * platform-agnostic so operation orchestration can run against any engine.
 */
export interface StepConfig {
  retries?: {
    limit: number;
    delay: string | number;
    backoff?: "constant" | "linear" | "exponential";
  };
  timeout?: string | number;
}

/**
 * Structural subset of Cloudflare Workflows' `WorkflowStep`. The inline
 * executor runs steps through a trivial implementation; the Workflows
 * executor passes the engine's own `step` object, which satisfies this
 * type structurally.
 */
export interface StepRunner {
  do<T>(name: string, fn: () => Promise<T>): Promise<T>;
  do<T>(name: string, config: StepConfig, fn: () => Promise<T>): Promise<T>;
}

/** The control-plane stores every operation write goes through. */
export interface TenantOperationStores {
  tenantOperations: TenantOperationsAdapter;
  tenantOperationEvents: TenantOperationEventsAdapter;
}

export interface EnqueueTenantOperationParams {
  kind: TenantOperationKind;
  /** Target tenant; null for fleet-level operations. */
  tenant_id: string | null;
  rollout_id?: string;
  initiated_by?: string;
  target_worker_version?: string;
  target_database_version?: string;
}

/**
 * Executes an already-persisted operation row. Row-first contract: the
 * caller (`enqueueTenantOperation`) creates the row and writes the
 * deterministic `engine_instance_id` before calling `start`, so a crashed
 * enqueue can never leave an untracked engine instance.
 *
 * - Inline executor: `start` runs the steps to a terminal status before
 *   resolving.
 * - Cloudflare Workflows executor (phase 2): `start` returns as soon as
 *   the instance is created; the workflow owns all further writes.
 */
export interface TenantOperationExecutor {
  readonly engine: "inline" | "cloudflare-workflows";
  start(operation: TenantOperation): Promise<void>;
}

/**
 * Step-boundary callback threaded through provisioning hooks so the
 * existing inline provision flow can report coarse step outcomes without
 * depending on this package (implementations accept it structurally).
 */
export type StepReporter = (
  step: string,
  outcome: "started" | "succeeded" | "failed",
  detail?: Record<string, unknown>,
) => Promise<void>;
