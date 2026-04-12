export interface CodeExecutionResult {
  success: boolean;
  error?: string;
  durationMs: number;
  apiCalls: Array<{ method: string; args: unknown[] }>;
}

export interface CodeExecutor {
  execute(params: {
    code: string;
    hookCodeId?: string;
    triggerId: string;
    event: Record<string, unknown>;
    timeoutMs?: number;
  }): Promise<CodeExecutionResult>;

  /**
   * Deploy user code to the execution environment.
   * Called when hook code is created or updated.
   * Optional — LocalCodeExecutor does not need this.
   */
  deploy?(hookCodeId: string, code: string): Promise<void>;

  /**
   * Remove user code from the execution environment.
   * Called when hook code is deleted.
   * Optional — LocalCodeExecutor does not need this.
   */
  remove?(hookCodeId: string): Promise<void>;
}
