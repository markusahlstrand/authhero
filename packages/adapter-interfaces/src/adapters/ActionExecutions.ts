import { ActionExecution, ActionExecutionInsert } from "../types";

export interface ActionExecutionsAdapter {
  create: (
    tenant_id: string,
    execution: ActionExecutionInsert,
  ) => Promise<ActionExecution>;
  get: (
    tenant_id: string,
    execution_id: string,
  ) => Promise<ActionExecution | null>;
  /**
   * Delete executions created before `olderThan` (ISO-8601), across all
   * tenants. Returns the number of rows deleted.
   *
   * Optional because some backends expire rows themselves (DynamoDB TTL,
   * Analytics Engine dataset retention) and have nothing to sweep.
   */
  cleanup?: (olderThan: string) => Promise<number>;
}
