import type { TenantOperation } from "@authhero/adapter-interfaces";
import {
  buildEngineInstanceId,
  type TenantOperationExecutor,
} from "@authhero/multi-tenancy";
import type { WorkflowsBinding } from "./types";

export interface CloudflareWorkflowsExecutorOptions {
  binding: WorkflowsBinding;
}

function isAlreadyExistsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /already exists|already been created|duplicate/i.test(message);
}

/**
 * `TenantOperationExecutor` backed by a Cloudflare Workflows binding
 * (issue #1026 phase 2). Row-first contract: `enqueueTenantOperation` has
 * already persisted the operation (with its deterministic
 * `engine_instance_id`) before `start` is called, so an instance can never
 * exist without a tracking row.
 *
 * `start` resolves as soon as the instance is created — the workflow owns
 * every subsequent write. Creating an instance whose id already exists is
 * treated as success (idempotent re-enqueue after a crashed caller).
 */
export function createCloudflareWorkflowsExecutor(
  options: CloudflareWorkflowsExecutorOptions,
): TenantOperationExecutor {
  return {
    engine: "cloudflare-workflows",

    async start(operation: TenantOperation): Promise<void> {
      if (operation.kind !== "provision") {
        throw new Error(
          `The Cloudflare Workflows executor does not support "${operation.kind}" operations yet (phase 2 covers provision only)`,
        );
      }
      if (!operation.tenant_id) {
        throw new Error("provision operations require a tenant_id");
      }

      const id =
        operation.engine_instance_id ?? buildEngineInstanceId(operation);

      try {
        await options.binding.create({
          id,
          params: {
            operation_id: operation.id,
            tenant_id: operation.tenant_id,
            kind: operation.kind,
          },
        });
      } catch (error) {
        if (!isAlreadyExistsError(error)) throw error;
        // The instance was already created by a previous (crashed) enqueue —
        // the run is in flight or finished; nothing more to do.
      }
    },
  };
}
