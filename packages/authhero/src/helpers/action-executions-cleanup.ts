import { ActionExecutionsAdapter } from "@authhero/adapter-interfaces";

export interface ActionExecutionsCleanupParams {
  /**
   * Days of execution history to keep. Defaults to 10, matching Auth0
   * ("Executions will only be stored for 10 days after their creation").
   *
   * Unlike `codes`, these rows have no expiry — they are diagnostic history,
   * referenced from logs when debugging an action. The window is a genuine
   * retention policy: long enough to investigate a report that arrives late,
   * short enough that the table stops growing without bound. Rows can carry
   * whatever a tenant's action wrote to `console`, so a shorter window is also
   * the safer one.
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
 *     retentionDays: 10,
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
  const retentionDays = params.retentionDays ?? 10;
  const cutoff = new Date(
    Date.now() - retentionDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  return actionExecutions.cleanup(cutoff);
}
