import { ActionExecutionsAdapter } from "@authhero/adapter-interfaces";

export interface ActionExecutionsCleanupParams {
  /**
   * Days of execution history to keep. Defaults to 30.
   *
   * Unlike `codes`, these rows have no expiry — they are diagnostic history,
   * referenced from logs when debugging an action. The window is a genuine
   * retention policy: long enough to investigate a report that arrives late,
   * short enough that the table stops growing without bound.
   */
  retentionDays?: number;
}

/**
 * Delete action executions created more than the retention window ago.
 *
 * Prefer `runRetention`, which calls this along with every other prunable
 * table — scheduling one call means a future prunable table is covered
 * without editing your handler. Use this directly only when you want to sweep
 * `action_executions` on its own schedule.
 *
 * Returns `null` when the adapter does not support cleanup (backends like
 * DynamoDB TTL or Analytics Engine expire rows themselves).
 *
 * @example
 * ```ts
 * // Cloudflare Workers scheduled handler
 * async scheduled(_event, env) {
 *   await cleanupActionExecutions(dataAdapter.actionExecutions, {
 *     retentionDays: 30,
 *   });
 * }
 * ```
 */
export async function cleanupActionExecutions(
  actionExecutions: ActionExecutionsAdapter,
  params: ActionExecutionsCleanupParams = {},
): Promise<number | null> {
  if (!actionExecutions.cleanup) {
    return null;
  }
  const retentionDays = params.retentionDays ?? 30;
  const cutoff = new Date(
    Date.now() - retentionDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  return actionExecutions.cleanup(cutoff);
}
