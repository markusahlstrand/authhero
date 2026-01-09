/**
 * Workflow Engine Types
 *
 * A simple, XState-informed workflow engine for managing multi-step flows.
 * Used by the widget/screen API, decoupled from login-specific logic.
 *
 * ## Architecture
 *
 * The workflow engine is designed to be:
 * 1. **Decoupled** - Not tied to authentication, can run any multi-step flow
 * 2. **Persistent** - State survives HTTP redirects via storage adapter
 * 3. **XState-compatible** - Concepts map to XState for potential migration
 * 4. **Server-driven** - Works with widget's server-side UI pattern
 *
 * ## Migration Path
 *
 * - **Legacy /u/ routes**: Continue using pipeline_state in LoginSession
 * - **New /u2/ widget routes**: Can use WorkflowEngine for cleaner state management
 * - **Eventually**: Migrate all flows to workflow engine, remove legacy
 *
 * ## Key Concepts
 *
 * | Our Concept      | XState Equivalent    |
 * |-----------------|---------------------|
 * | step            | State node          |
 * | suspended       | Invoked service     |
 * | context         | Machine context     |
 * | StepResult.next | Transition          |
 * | StepDefinition.execute | Actions/effects |
 */

import type { UiScreen } from "@authhero/adapter-interfaces";

/**
 * Workflow state - stored in DB, survives redirects
 * Intentionally simple for easy serialization
 */
export interface WorkflowState<TContext = Record<string, unknown>> {
  /** Unique ID for this workflow instance */
  id: string;

  /** Which workflow definition this is running */
  workflowId: string;

  /** Current step ID */
  step: string;

  /**
   * Suspension state - when the workflow is waiting for external input
   * null means the workflow is ready to advance
   */
  suspended: {
    type: "screen" | "redirect" | "webhook";
    /** For screens: which screen to show */
    screenId?: string;
    /** For redirects: where to redirect */
    url?: string;
    /** Additional data for resumption */
    data?: Record<string, unknown>;
  } | null;

  /** Shared data across all steps - accumulated as workflow progresses */
  context: TContext;

  /** Timestamps */
  createdAt: string;
  expiresAt: string;
}

/**
 * What a step returns after execution
 */
export type StepResult =
  | { type: "next"; step: string; context?: Record<string, unknown> }
  | { type: "screen"; screenId: string; context?: Record<string, unknown> }
  | { type: "redirect"; url: string; context?: Record<string, unknown> }
  | { type: "complete"; result?: unknown }
  | { type: "error"; code: string; message: string };

/**
 * Context passed to step handlers
 */
export interface StepContext<TContext = Record<string, unknown>> {
  /** The current workflow state */
  state: WorkflowState<TContext>;

  /** Input from the previous step (e.g., form submission data) */
  input?: Record<string, unknown>;

  /** Access to external services */
  services: WorkflowServices;
}

/**
 * External services available to workflow steps
 */
export interface WorkflowServices {
  /** Data adapters for DB access */
  data: unknown; // DataAdapters - keep generic for decoupling

  /** HTTP context for request info */
  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
  };

  /** Tenant information */
  tenant: {
    id: string;
    name?: string;
  };

  /** Additional service context */
  [key: string]: unknown;
}

/**
 * Step definition - describes what a step does
 */
export interface StepDefinition<TContext = Record<string, unknown>> {
  /** Unique step ID */
  id: string;

  /** Human-readable name */
  name?: string;

  /**
   * Step type:
   * - screen: Show UI, wait for user input
   * - action: Execute code, advance immediately
   * - condition: Evaluate and branch to different steps
   * - redirect: Redirect externally, wait for return
   */
  type: "screen" | "action" | "condition" | "redirect";

  /**
   * For screen steps: generate the UI screen
   */
  getScreen?: (ctx: StepContext<TContext>) => UiScreen;

  /**
   * For action/condition steps: execute logic and return next step
   * For screen steps: handle form submission
   */
  execute?: (ctx: StepContext<TContext>) => Promise<StepResult>;

  /**
   * Default next step (if execute doesn't specify)
   */
  next?: string;
}

/**
 * Workflow definition - a sequence of steps
 */
export interface WorkflowDefinition<TContext = Record<string, unknown>> {
  /** Unique workflow ID (e.g., "login", "signup", "onboarding") */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description */
  description?: string;

  /** First step to execute */
  startStep: string;

  /** All steps in this workflow */
  steps: Map<string, StepDefinition<TContext>>;

  /** Default context values */
  defaultContext?: Partial<TContext>;

  /** Workflow-level hooks */
  hooks?: {
    onStart?: (ctx: StepContext<TContext>) => Promise<void>;
    onComplete?: (ctx: StepContext<TContext>, result: unknown) => Promise<void>;
    onError?: (ctx: StepContext<TContext>, error: Error) => Promise<void>;
  };
}

/**
 * Result from running a workflow step
 */
export type WorkflowRunResult =
  | {
      type: "screen";
      screen: UiScreen;
      state: WorkflowState;
    }
  | {
      type: "redirect";
      url: string;
      state: WorkflowState;
    }
  | {
      type: "complete";
      result?: unknown;
      state: WorkflowState;
    }
  | {
      type: "error";
      code: string;
      message: string;
      state?: WorkflowState;
    };

/**
 * Storage adapter for workflow state persistence
 */
export interface WorkflowStorage {
  /** Save workflow state */
  save(state: WorkflowState): Promise<void>;

  /** Load workflow state by ID */
  load(id: string): Promise<WorkflowState | null>;

  /** Delete workflow state */
  delete(id: string): Promise<void>;
}
