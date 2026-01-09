/**
 * Workflow Engine
 *
 * Executes workflow definitions, managing state transitions and suspensions.
 * Decoupled from login-specific logic - can be used for any multi-step flow.
 */

import { nanoid } from "nanoid";
import type {
  WorkflowState,
  WorkflowDefinition,
  WorkflowStorage,
  WorkflowServices,
  WorkflowRunResult,
  StepContext,
  StepResult,
} from "./types";

/**
 * Configuration for the workflow engine
 */
export interface WorkflowEngineConfig {
  /** Storage adapter for persisting workflow state */
  storage: WorkflowStorage;

  /** Default expiration time in seconds (default: 1 hour) */
  defaultExpiresIn?: number;

  /** Function to generate workflow IDs (default: nanoid) */
  generateId?: () => string;
}

/**
 * Workflow Engine - runs workflows and manages state
 */
export class WorkflowEngine {
  private storage: WorkflowStorage;
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private defaultExpiresIn: number;
  private generateId: () => string;

  constructor(config: WorkflowEngineConfig) {
    this.storage = config.storage;
    this.defaultExpiresIn = config.defaultExpiresIn ?? 3600;
    this.generateId = config.generateId ?? (() => nanoid());
  }

  /**
   * Register a workflow definition
   */
  register(workflow: WorkflowDefinition): void {
    this.workflows.set(workflow.id, workflow);
  }

  /**
   * Get a registered workflow definition
   */
  getWorkflow(workflowId: string): WorkflowDefinition | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * Start a new workflow instance
   */
  async start(
    workflowId: string,
    services: WorkflowServices,
    initialContext?: Record<string, unknown>,
  ): Promise<WorkflowRunResult> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      return {
        type: "error",
        code: "WORKFLOW_NOT_FOUND",
        message: `Workflow not found: ${workflowId}`,
      };
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.defaultExpiresIn * 1000);

    const state: WorkflowState = {
      id: this.generateId(),
      workflowId,
      step: workflow.startStep,
      suspended: null,
      context: {
        ...workflow.defaultContext,
        ...initialContext,
      },
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    // Call onStart hook
    if (workflow.hooks?.onStart) {
      try {
        await workflow.hooks.onStart({
          state,
          services,
        });
      } catch (error) {
        return {
          type: "error",
          code: "START_HOOK_FAILED",
          message: error instanceof Error ? error.message : "Start hook failed",
          state,
        };
      }
    }

    // Run the first step
    return this.runStep(workflow, state, services);
  }

  /**
   * Resume a suspended workflow with input
   */
  async resume(
    stateId: string,
    services: WorkflowServices,
    input?: Record<string, unknown>,
  ): Promise<WorkflowRunResult> {
    const state = await this.storage.load(stateId);
    if (!state) {
      return {
        type: "error",
        code: "STATE_NOT_FOUND",
        message: `Workflow state not found: ${stateId}`,
      };
    }

    // Check expiration
    if (new Date(state.expiresAt) < new Date()) {
      await this.storage.delete(stateId);
      return {
        type: "error",
        code: "WORKFLOW_EXPIRED",
        message: "Workflow has expired",
      };
    }

    const workflow = this.workflows.get(state.workflowId);
    if (!workflow) {
      return {
        type: "error",
        code: "WORKFLOW_NOT_FOUND",
        message: `Workflow not found: ${state.workflowId}`,
      };
    }

    // Process the input through the current step
    const step = workflow.steps.get(state.step);
    if (!step) {
      return {
        type: "error",
        code: "STEP_NOT_FOUND",
        message: `Step not found: ${state.step}`,
        state,
      };
    }

    // Clear suspension - we're processing input
    state.suspended = null;

    // Execute the step's handler with input
    if (step.execute) {
      const ctx: StepContext = {
        state,
        input,
        services,
      };

      let result: StepResult;
      try {
        result = await step.execute(ctx);
      } catch (error) {
        return {
          type: "error",
          code: "STEP_EXECUTION_FAILED",
          message: error instanceof Error ? error.message : "Step execution failed",
          state,
        };
      }

      return this.handleStepResult(workflow, state, result, services);
    }

    // No execute handler - use default next
    if (step.next) {
      state.step = step.next;
      return this.runStep(workflow, state, services);
    }

    return {
      type: "error",
      code: "NO_NEXT_STEP",
      message: `Step ${state.step} has no execute handler or next step`,
      state,
    };
  }

  /**
   * Get the current screen for a suspended workflow
   */
  async getCurrentScreen(
    stateId: string,
    services: WorkflowServices,
  ): Promise<WorkflowRunResult> {
    const state = await this.storage.load(stateId);
    if (!state) {
      return {
        type: "error",
        code: "STATE_NOT_FOUND",
        message: `Workflow state not found: ${stateId}`,
      };
    }

    if (new Date(state.expiresAt) < new Date()) {
      return {
        type: "error",
        code: "WORKFLOW_EXPIRED",
        message: "Workflow has expired",
      };
    }

    const workflow = this.workflows.get(state.workflowId);
    if (!workflow) {
      return {
        type: "error",
        code: "WORKFLOW_NOT_FOUND",
        message: `Workflow not found: ${state.workflowId}`,
      };
    }

    // If not suspended on a screen, return error
    if (state.suspended?.type !== "screen") {
      return {
        type: "error",
        code: "NOT_SUSPENDED_ON_SCREEN",
        message: "Workflow is not waiting for screen input",
        state,
      };
    }

    const step = workflow.steps.get(state.step);
    if (!step?.getScreen) {
      return {
        type: "error",
        code: "NO_SCREEN_HANDLER",
        message: `Step ${state.step} has no getScreen handler`,
        state,
      };
    }

    const screen = step.getScreen({
      state,
      services,
    });

    return {
      type: "screen",
      screen,
      state,
    };
  }

  /**
   * Run a step and handle its result
   */
  private async runStep(
    workflow: WorkflowDefinition,
    state: WorkflowState,
    services: WorkflowServices,
    input?: Record<string, unknown>,
  ): Promise<WorkflowRunResult> {
    const step = workflow.steps.get(state.step);
    if (!step) {
      return {
        type: "error",
        code: "STEP_NOT_FOUND",
        message: `Step not found: ${state.step}`,
        state,
      };
    }

    const ctx: StepContext = {
      state,
      input,
      services,
    };

    // For screen steps without prior input, suspend and show screen
    if (step.type === "screen" && !input) {
      if (!step.getScreen) {
        return {
          type: "error",
          code: "NO_SCREEN_HANDLER",
          message: `Screen step ${state.step} has no getScreen handler`,
          state,
        };
      }

      const screen = step.getScreen(ctx);

      // Suspend on this screen
      state.suspended = {
        type: "screen",
        screenId: step.id,
      };

      await this.storage.save(state);

      return {
        type: "screen",
        screen,
        state,
      };
    }

    // For action/condition steps, or screen steps with input, execute
    if (step.execute) {
      let result: StepResult;
      try {
        result = await step.execute(ctx);
      } catch (error) {
        if (workflow.hooks?.onError) {
          await workflow.hooks.onError(ctx, error as Error);
        }
        return {
          type: "error",
          code: "STEP_EXECUTION_FAILED",
          message: error instanceof Error ? error.message : "Step execution failed",
          state,
        };
      }

      return this.handleStepResult(workflow, state, result, services);
    }

    // No execute - use default next
    if (step.next) {
      state.step = step.next;
      return this.runStep(workflow, state, services);
    }

    return {
      type: "error",
      code: "STEP_INCOMPLETE",
      message: `Step ${state.step} did not produce a result`,
      state,
    };
  }

  /**
   * Handle the result from a step execution
   */
  private async handleStepResult(
    workflow: WorkflowDefinition,
    state: WorkflowState,
    result: StepResult,
    services: WorkflowServices,
  ): Promise<WorkflowRunResult> {
    // Merge any context updates
    if ("context" in result && result.context) {
      state.context = {
        ...state.context,
        ...result.context,
      };
    }

    switch (result.type) {
      case "next": {
        state.step = result.step;
        state.suspended = null;
        return this.runStep(workflow, state, services);
      }

      case "screen": {
        // Find the step that shows this screen
        const screenStep = workflow.steps.get(result.screenId);
        if (!screenStep?.getScreen) {
          return {
            type: "error",
            code: "SCREEN_NOT_FOUND",
            message: `Screen step not found: ${result.screenId}`,
            state,
          };
        }

        state.step = result.screenId;
        state.suspended = {
          type: "screen",
          screenId: result.screenId,
        };

        await this.storage.save(state);

        const screen = screenStep.getScreen({
          state,
          services,
        });

        return {
          type: "screen",
          screen,
          state,
        };
      }

      case "redirect": {
        state.suspended = {
          type: "redirect",
          url: result.url,
        };

        await this.storage.save(state);

        return {
          type: "redirect",
          url: result.url,
          state,
        };
      }

      case "complete": {
        // Call onComplete hook
        if (workflow.hooks?.onComplete) {
          try {
            await workflow.hooks.onComplete(
              { state, services },
              result.result,
            );
          } catch (error) {
            // Log but don't fail the workflow
            console.error("onComplete hook failed:", error);
          }
        }

        // Clean up state
        await this.storage.delete(state.id);

        return {
          type: "complete",
          result: result.result,
          state,
        };
      }

      case "error": {
        return {
          type: "error",
          code: result.code,
          message: result.message,
          state,
        };
      }

      default: {
        return {
          type: "error",
          code: "UNKNOWN_RESULT",
          message: "Unknown step result type",
          state,
        };
      }
    }
  }
}

/**
 * Create a workflow engine with the given config
 */
export function createWorkflowEngine(
  config: WorkflowEngineConfig,
): WorkflowEngine {
  return new WorkflowEngine(config);
}
