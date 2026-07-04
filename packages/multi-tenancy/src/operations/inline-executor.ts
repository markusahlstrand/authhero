import { TenantOperation, TenantOperationKind } from "authhero";
import {
  StepRunner,
  TenantOperationExecutor,
  TenantOperationStores,
} from "./types";
import { createOperationRecorder } from "./recorder";

export interface TenantOperationStepContext {
  operation: TenantOperation;
  step: StepRunner;
}

/**
 * A named, idempotent unit of work. The resolved value (when a plain
 * object) is stored as the succeeded-event detail.
 */
export interface TenantOperationStep {
  name: string;
  run(ctx: TenantOperationStepContext): Promise<Record<string, unknown> | void>;
}

/**
 * Maps an operation kind to its ordered steps. Factories receive the
 * operation row so steps can read the target tenant / versions — but they
 * must resolve all heavy dependencies from their own closure, never from
 * serialized state.
 */
export type TenantOperationDefinitions = Partial<
  Record<
    TenantOperationKind,
    (operation: TenantOperation) => TenantOperationStep[]
  >
>;

/**
 * Trivial StepRunner: no retries, no durability — runs the function
 * immediately. Used by the inline executor so operation definitions are
 * written against the same `StepRunner` seam the Workflows engine
 * satisfies in phase 2.
 */
export const inlineStepRunner: StepRunner = {
  async do<T>(
    _name: string,
    configOrFn: unknown,
    maybeFn?: () => Promise<T>,
  ): Promise<T> {
    const fn =
      typeof configOrFn === "function"
        ? (configOrFn as () => Promise<T>)
        : maybeFn;
    if (!fn) {
      throw new Error("StepRunner.do called without a function");
    }
    return fn();
  },
};

export interface InlineExecutorConfig {
  stores: TenantOperationStores;
  definitions: TenantOperationDefinitions;
}

/**
 * Runs operations synchronously in the calling process, writing the same
 * operation/event rows the durable executor writes. Used by tests and
 * deployments without Cloudflare Workflows; `enqueueTenantOperation`
 * resolves only after the run reaches a terminal status.
 */
export function createInlineExecutor(
  config: InlineExecutorConfig,
): TenantOperationExecutor {
  const recorder = createOperationRecorder(config.stores);

  return {
    engine: "inline",

    async start(operation: TenantOperation): Promise<void> {
      const definition = config.definitions[operation.kind];
      if (!definition) {
        const error = new Error(
          `No inline operation definition for kind "${operation.kind}"`,
        );
        await recorder.markFailed(operation.id, error);
        throw error;
      }

      const steps = definition(operation);
      await recorder.markRunning(operation.id, steps[0]?.name);

      for (const step of steps) {
        await recorder.setCurrentStep(operation.id, step.name);
        await recorder.appendEvent(operation.id, {
          step: step.name,
          outcome: "started",
        });
        try {
          const detail = await step.run({
            operation,
            step: inlineStepRunner,
          });
          await recorder.appendEvent(operation.id, {
            step: step.name,
            outcome: "succeeded",
            detail: detail ?? undefined,
          });
        } catch (error) {
          await recorder.appendEvent(operation.id, {
            step: step.name,
            outcome: "failed",
            detail: { message: String(error) },
          });
          await recorder.markFailed(operation.id, error);
          throw error;
        }
      }

      await recorder.markSucceeded(operation.id);
    },
  };
}
