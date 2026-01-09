/**
 * Login Session Storage Adapter
 *
 * Bridges the WorkflowStorage interface with the existing LoginSession storage.
 * This allows the workflow engine to use LoginSession as its persistence layer.
 */

import type { DataAdapters, LoginSession } from "@authhero/adapter-interfaces";
import type { WorkflowState, WorkflowStorage } from "./types";

/**
 * Maps WorkflowState to/from LoginSession.pipeline_state
 */
export class LoginSessionWorkflowStorage implements WorkflowStorage {
  constructor(
    private data: DataAdapters,
    private tenantId: string,
  ) {}

  /**
   * Save workflow state by updating the LoginSession
   */
  async save(state: WorkflowState): Promise<void> {
    // The workflow state ID is the login session ID
    await this.data.loginSessions.update(this.tenantId, state.id, {
      pipeline_state: {
        position: 0, // Not used in new system, but keep for compatibility
        current: state.suspended
          ? {
              type: state.suspended.type === "screen" ? "form" : "action",
              id: state.step,
              step: state.suspended.screenId,
            }
          : null,
        context: {
          ...state.context,
          _workflow: {
            workflowId: state.workflowId,
            step: state.step,
            suspended: state.suspended,
          },
        },
      },
    });
  }

  /**
   * Load workflow state from LoginSession
   */
  async load(id: string): Promise<WorkflowState | null> {
    const session = await this.data.loginSessions.get(this.tenantId, id);
    if (!session) {
      return null;
    }

    return this.sessionToWorkflowState(session);
  }

  /**
   * Delete workflow state (clear pipeline_state from LoginSession)
   */
  async delete(id: string): Promise<void> {
    await this.data.loginSessions.update(this.tenantId, id, {
      pipeline_state: {
        position: 0,
        current: null,
        context: {},
      },
    });
  }

  /**
   * Convert a LoginSession to WorkflowState
   */
  sessionToWorkflowState(session: LoginSession): WorkflowState {
    const pipelineContext = session.pipeline_state?.context ?? {};
    const workflowMeta = (pipelineContext as Record<string, unknown>)._workflow as
      | {
          workflowId: string;
          step: string;
          suspended: WorkflowState["suspended"];
        }
      | undefined;

    // If we have workflow metadata, use it
    if (workflowMeta) {
      const { _workflow, ...restContext } = pipelineContext as Record<
        string,
        unknown
      >;
      return {
        id: session.id,
        workflowId: workflowMeta.workflowId,
        step: workflowMeta.step,
        suspended: workflowMeta.suspended,
        context: restContext,
        createdAt: session.created_at,
        expiresAt: session.expires_at,
      };
    }

    // Otherwise, try to infer from legacy pipeline_state
    const current = session.pipeline_state?.current;
    return {
      id: session.id,
      workflowId: "login", // Default workflow
      step: current?.id ?? "identifier",
      suspended: current
        ? {
            type: "screen",
            screenId: current.step ?? current.id,
          }
        : null,
      context: pipelineContext,
      createdAt: session.created_at,
      expiresAt: session.expires_at,
    };
  }
}

/**
 * Create a storage adapter for a specific tenant
 */
export function createLoginSessionStorage(
  data: DataAdapters,
  tenantId: string,
): WorkflowStorage {
  return new LoginSessionWorkflowStorage(data, tenantId);
}
